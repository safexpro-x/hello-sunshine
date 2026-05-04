import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import Peer, { type MediaConnection } from "peerjs";
import { Mic, MicOff, PhoneOff, Phone, Bot, Loader2, AlertCircle, Globe, ShieldX, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { createPeer, userPeerId, getHighQualityMicStream, tuneOutgoingAudio } from "@/lib/peer";
import { startListening, speak, cancelSpeak, isSpeechSupported, warmupTTS, type RecognitionHandle } from "@/lib/voice";
import { LANGUAGES, type Lang } from "@/lib/languages";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Stage = "loading" | "blocked" | "no-plan" | "lang" | "intro" | "ready" | "ai-active" | "connected" | "ended" | "error";
interface Company { id: string; name: string; website: string | null; business_description: string }
interface Collected { name?: string | null; email?: string | null; phone?: string | null; issue?: string | null }

export default function CustomerWidget() {
  // Route param is the SHORT SLUG (not the api_key). The real api_key never reaches the browser.
  const { apiKey: slug = "" } = useParams();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [language, setLanguage] = useState<Lang>(LANGUAGES[0]);
  const [customerName, setCustomerName] = useState("");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [transcript, setTranscript] = useState<{ from: "you" | "ai"; text: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [callDuration, setCallDuration] = useState(0);

  const roomIdRef = useRef<string>("");
  const callDbIdRef = useRef<string | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const recognitionRef = useRef<RecognitionHandle | null>(null);
  const aiActiveRef = useRef(false);
  const aiSpeakingRef = useRef(false);
  const aiThinkingRef = useRef(false);
  const messagesRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const collectedRef = useRef<Collected>({});
  const durationTimerRef = useRef<number | null>(null);
  const connectedRef = useRef(false);
  const startedAtRef = useRef<number>(0);
  const languageRef = useRef<Lang>(LANGUAGES[0]);
  const companyRef = useRef<Company | null>(null);
  const askAIRef = useRef<(text: string) => void>(() => {});
  const restartTimerRef = useRef<number | null>(null);
  const lastUserUtteranceRef = useRef<string>("");

  // keep refs synced with state for stable callbacks
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { companyRef.current = company; }, [company]);
  useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);
  useEffect(() => { aiThinkingRef.current = aiThinking; }, [aiThinking]);
  const speakerOnRef = useRef(true);
  useEffect(() => { speakerOnRef.current = speakerOn; }, [speakerOn]);

  // Bootstrap: resolve slug -> safe company info via edge function
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("widget-bootstrap", { body: { slug, origin: window.location.origin } });
      if (error || !data?.company) {
        setErrorMsg(data?.error || "Invalid widget link.");
        setStage("error"); return;
      }
      if (data.blocked) { setStage("blocked"); setCompany(data.company); return; }
      if (!data.canCall) { setStage("no-plan"); setCompany(data.company); return; }
      setCompany(data.company);
      setStage("lang");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const stopRecognition = useCallback(() => {
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
  }, []);

  const stopAI = useCallback(() => {
    aiActiveRef.current = false;
    cancelSpeak();
    setAiSpeaking(false); setAiThinking(false);
    stopRecognition();
  }, [stopRecognition]);

  const persistCollected = useCallback(async (extracted: Collected) => {
    collectedRef.current = { ...collectedRef.current, ...extracted };
    if (!callDbIdRef.current) return;
    await supabase.from("calls").update({
      customer_name: collectedRef.current.name ?? customerName ?? null,
      customer_email: collectedRef.current.email ?? null,
      customer_phone: collectedRef.current.phone ?? null,
      customer_issue: collectedRef.current.issue ?? null,
    }).eq("id", callDbIdRef.current);
  }, [customerName]);

  // Stable listener — uses refs only, never recreated
  const startUserListening = useCallback(() => {
    if (!aiActiveRef.current) return;
    if (recognitionRef.current) return;
    if (aiSpeakingRef.current || aiThinkingRef.current) return;

    let finalDelivered = false;

    recognitionRef.current = startListening({
      lang: languageRef.current.bcp47,
      onResult: (text, isFinal) => {
        if (!isFinal) return;
        if (finalDelivered) return;
        if (!text || text.length < 2) return;
        if (text === lastUserUtteranceRef.current) return;
        finalDelivered = true;
        lastUserUtteranceRef.current = text;
        setTranscript((t) => [...t, { from: "you", text }]);
        // Stop recognition cleanly so we can speak without overlap
        if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
        askAIRef.current(text);
      },
      onError: (err) => {
        // 'no-speech' / 'aborted' / 'audio-capture' — just retry shortly
        if (recognitionRef.current) { recognitionRef.current = null; }
        if (!aiActiveRef.current) return;
        if (err === "not-allowed" || err === "service-not-allowed") {
          toast({ title: "Microphone blocked", description: "Please allow mic access and tap Mic again.", variant: "destructive" });
          return;
        }
        // Retry after a short delay
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => {
          if (aiActiveRef.current && !aiSpeakingRef.current && !aiThinkingRef.current && !recognitionRef.current) {
            startUserListening();
          }
        }, 600);
      },
      onEnd: () => {
        recognitionRef.current = null;
        if (!aiActiveRef.current) return;
        if (finalDelivered) return; // askAI will restart listening after speak finishes
        // Auto-restart if AI isn't currently speaking/thinking
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => {
          if (aiActiveRef.current && !aiSpeakingRef.current && !aiThinkingRef.current && !recognitionRef.current) {
            startUserListening();
          }
        }, 350);
      },
    });
  }, [toast]);

  const askAI = useCallback(async (userText: string) => {
    if (!aiActiveRef.current || !companyRef.current) return;
    setAiThinking(true);
    aiThinkingRef.current = true;
    messagesRef.current.push({ role: "user", content: userText });
    let reply = "";
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: messagesRef.current.slice(-16),
          company: companyRef.current,
          languageName: languageRef.current.name,
          collected: collectedRef.current,
        },
      });
      if (error) throw error;
      reply = (data?.reply as string) || "";
      if (data?.extracted) persistCollected(data.extracted);
    } catch (e) {
      console.error("ai-assistant error:", e);
    }

    if (!aiActiveRef.current) return;
    if (!reply) {
      reply = languageRef.current.code === "hi" ? "एक पल रुकिए, एजेंट जल्द ही जुड़ेंगे।" :
              languageRef.current.code === "bn" ? "একটু অপেক্ষা করুন, এজেন্ট শীঘ্রই যোগ দেবেন।" :
              languageRef.current.code === "ta" ? "ஒரு நிமிடம், எங்கள் முகவர் விரைவில் இணைவார்." :
              "One moment — our agent will join shortly.";
    }

    messagesRef.current.push({ role: "assistant", content: reply });
    setTranscript((t) => [...t, { from: "ai", text: reply }]);
    setAiThinking(false); aiThinkingRef.current = false;
    setAiSpeaking(true); aiSpeakingRef.current = true;

    const onSpeakEnd = () => {
      aiSpeakingRef.current = false;
      setAiSpeaking(false);
      if (aiActiveRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => {
          if (aiActiveRef.current && !aiSpeakingRef.current && !aiThinkingRef.current) {
            startUserListening();
          }
        }, 250);
      }
    };
    if (!speakerOnRef.current) {
      // Speaker off — skip TTS but keep loop going
      setTimeout(onSpeakEnd, 50);
    } else {
      speak(reply, {
        lang: languageRef.current.bcp47,
        onEnd: onSpeakEnd,
        onError: () => {
          aiSpeakingRef.current = false;
          setAiSpeaking(false);
          if (aiActiveRef.current) startUserListening();
        },
      });
    }
  }, [persistCollected, startUserListening]);

  // keep askAI ref fresh
  useEffect(() => { askAIRef.current = askAI; }, [askAI]);

  const startAIHold = useCallback(() => {
    if (aiActiveRef.current) return;
    if (!isSpeechSupported()) {
      toast({ title: "Voice limited", description: "Use Chrome/Edge for AI hold." });
      return;
    }
    aiActiveRef.current = true;
    setStage("ai-active");
    const greeting = languageRef.current.greeting;
    messagesRef.current = [{ role: "assistant", content: greeting }];
    setTranscript([{ from: "ai", text: greeting }]);
    setAiSpeaking(true); aiSpeakingRef.current = true;
    speak(greeting, {
      lang: languageRef.current.bcp47,
      onEnd: () => {
        aiSpeakingRef.current = false;
        setAiSpeaking(false);
        if (aiActiveRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => startUserListening(), 200);
        }
      },
      onError: () => {
        aiSpeakingRef.current = false;
        setAiSpeaking(false);
        if (aiActiveRef.current) startUserListening();
      },
    });
  }, [startUserListening, toast]);

  const endCall = useCallback(async () => {
    connectedRef.current = false;
    stopAI();
    callRef.current?.close(); callRef.current = null;
    peerRef.current?.destroy(); peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    const dur = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;
    if (callDbIdRef.current) {
      await supabase.from("calls").update({ status: "ended", ended_at: new Date().toISOString(), duration_seconds: dur }).eq("id", callDbIdRef.current);
      // Auto-expire the session token
      await supabase.from("call_sessions").update({ consumed_at: new Date().toISOString() }).eq("call_id", callDbIdRef.current);
    }
    setCallDuration(0);
    setStage("ended");
  }, [stopAI]);

  const setupCall = useCallback((call: MediaConnection) => {
    callRef.current = call;
    call.on("stream", async (remoteStream) => {
      if (connectedRef.current) return;
      connectedRef.current = true;
      stopAI();
      setStage("connected");
      // Tune outgoing audio for HQ Opus
      const pc = (call as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      if (pc) await tuneOutgoingAudio(pc);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
      startedAtRef.current = Date.now();
      durationTimerRef.current = window.setInterval(() => {
        setCallDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);
      if (callDbIdRef.current) {
        await supabase.from("calls").update({ status: "active", picked_at: new Date().toISOString() }).eq("id", callDbIdRef.current);
      }
      setTimeout(() => speak(
        language.code === "hi" ? "सहायता एजेंट जुड़ गया है।" :
        language.code === "bn" ? "সাপোর্ট এজেন্ট যোগ দিয়েছেন।" :
        language.code === "ta" ? "ஆதரவு முகவர் இணைந்தார்." :
        "Support agent connected.",
        { lang: language.bcp47 }
      ), 200);
    });
    call.on("close", () => { if (connectedRef.current) endCall(); });
    call.on("error", (err) => console.error("call error:", err));
  }, [endCall, language, stopAI]);

  const startCall = useCallback(async () => {
    if (!company) return;
    setStage("ready");
    connectedRef.current = false;

    try {
      // Server creates the call (gating + IP capture + session token).
      const { data, error } = await supabase.functions.invoke("call-start", {
        body: {
          slug,
          customer_name: customerName.trim() || null,
          language: language.code,
          origin: window.location.origin,
        },
      });
      if (error || !data?.room_id) {
        const msg = data?.reason || data?.error || "Failed to start call.";
        if (data?.error === "blocked") setStage("blocked");
        else if (data?.error === "plan_inactive") setStage("no-plan");
        else { setErrorMsg(msg); setStage("error"); }
        return;
      }
      roomIdRef.current = data.room_id;
      callDbIdRef.current = data.call_id;
      collectedRef.current = { name: customerName.trim() || null };

      const stream = await getHighQualityMicStream();
      localStreamRef.current = stream;

      const peer = createPeer(userPeerId(roomIdRef.current));
      peerRef.current = peer;
      peer.on("open", () => startAIHold());
      peer.on("call", (incoming) => {
        if (connectedRef.current) { incoming.close(); return; }
        incoming.answer(stream);
        setupCall(incoming);
      });
      peer.on("error", (err: { type?: string }) => {
        if (err?.type === "unavailable-id") { setErrorMsg("Call already running in another tab."); setStage("error"); }
        else if (err?.type !== "peer-unavailable") setErrorMsg("Connection issue: " + (err?.type || "unknown"));
      });
    } catch (e) {
      const err = e as { name?: string };
      setErrorMsg(err?.name === "NotAllowedError" ? "Microphone permission denied." : "Failed to start call.");
      setStage("error");
    }
  }, [company, slug, customerName, language, setupCall, startAIHold]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled; setMuted(!track.enabled);
  };

  const toggleSpeaker = () => {
    setSpeakerOn((prev) => {
      const next = !prev;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
      if (!next) cancelSpeak();
      return next;
    });
  };

  useEffect(() => () => {
    connectedRef.current = false; stopAI();
    callRef.current?.close(); peerRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
  }, [stopAI]);

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  if (stage === "loading") {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
  }
  if (stage === "error" || !company) {
    return <div className="min-h-screen grid place-items-center px-4">
      <Card className="glass border-border/60 p-6 text-center max-w-sm">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2"/>
        <p>{errorMsg || "Widget unavailable."}</p>
      </Card>
    </div>;
  }
  if (stage === "blocked") {
    return <div className="min-h-screen grid place-items-center px-4">
      <Card className="glass border-destructive/40 p-6 text-center max-w-sm">
        <ShieldX className="h-10 w-10 text-destructive mx-auto mb-2"/>
        <h2 className="text-lg font-bold">Access blocked</h2>
        <p className="text-sm text-muted-foreground mt-2">This company has restricted calls from your network.</p>
      </Card>
    </div>;
  }
  if (stage === "no-plan") {
    return <div className="min-h-screen grid place-items-center px-4">
      <Card className="glass border-warning/40 p-6 text-center max-w-sm">
        <AlertCircle className="h-10 w-10 text-warning mx-auto mb-2"/>
        <h2 className="text-lg font-bold">{company?.name} is offline</h2>
        <p className="text-sm text-muted-foreground mt-2">Voice support is temporarily unavailable. Please try later.</p>
      </Card>
    </div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="container py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold">{company?.name}</h1>
          <p className="text-xs text-muted-foreground">Voice support</p>
        </div>
        <Badge variant="outline" className="text-xs">Powered by Zentord</Badge>
      </header>

      <main className="container flex-1 flex items-center justify-center py-6">
        <Card className="glass w-full max-w-md border-border/60 p-6 text-center">
          {stage === "lang" && (<>
            <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-gradient-primary shadow-glow mb-4">
              <Globe className="h-6 w-6 text-primary-foreground"/>
            </div>
            <h2 className="text-xl font-bold">Choose your language</h2>
            <p className="text-sm text-muted-foreground mt-1">Zentord AI will speak with you while we connect an agent.</p>
            <div className="grid grid-cols-2 gap-2 mt-5">
              {LANGUAGES.map((l) => (
                <Button key={l.code} variant={language.code === l.code ? "default" : "outline"}
                  className={cn("justify-start", language.code === l.code && "bg-gradient-primary text-primary-foreground")}
                  onClick={() => setLanguage(l)}>{l.name}</Button>
              ))}
            </div>
            <Button className="w-full mt-5 bg-gradient-primary text-primary-foreground" onClick={() => { warmupTTS(); setStage("intro"); }}>Continue</Button>
          </>)}

          {stage === "intro" && (<>
            <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-gradient-primary shadow-glow mb-4">
              <Phone className="h-6 w-6 text-primary-foreground"/>
            </div>
            <h2 className="text-xl font-bold">Almost ready</h2>
            <p className="text-sm text-muted-foreground mt-1">Optional: tell us your name so the agent can greet you.</p>
            <Input className="mt-5" placeholder="Your name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80}/>
            <Button className="w-full mt-4 bg-gradient-primary text-primary-foreground" onClick={() => { warmupTTS(); setTimeout(startCall, 50); }}>
              <Phone className="h-4 w-4 mr-2"/> Start call
            </Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setStage("lang")}>← Change language</Button>
          </>)}

          {(stage === "ready" || stage === "ai-active" || stage === "connected") && (<>
            <div className="relative mx-auto mb-5 grid h-32 w-32 place-items-center">
              {/* outer pulse rings */}
              {(stage === "ai-active" || stage === "connected") && (
                <>
                  <div className={cn("absolute inset-0 rounded-full animate-ping opacity-30",
                    stage === "ai-active" ? "bg-accent" : "bg-primary")} style={{ animationDuration: "2.4s" }}/>
                  <div className={cn("absolute inset-2 rounded-full animate-ping opacity-40",
                    stage === "ai-active" ? "bg-accent" : "bg-primary")} style={{ animationDuration: "1.8s" }}/>
                </>
              )}
              <div className={cn("relative grid h-24 w-24 place-items-center rounded-full transition-all",
                stage === "ai-active" ? "bg-gradient-accent shadow-accent-glow" :
                stage === "connected" ? "bg-gradient-primary shadow-glow" : "bg-secondary",
                aiSpeaking && "scale-110")}>
                {stage === "ai-active" ? <Bot className="h-10 w-10 text-accent-foreground"/> :
                 stage === "connected" ? <Phone className="h-10 w-10 text-primary-foreground"/> :
                 <Loader2 className="h-10 w-10 animate-spin text-muted-foreground"/>}
              </div>
            </div>

            {/* Animated voice bars when AI speaks */}
            {stage === "ai-active" && aiSpeaking && (
              <div className="flex items-end justify-center gap-1 h-6 mb-2" aria-hidden>
                {[0,1,2,3,4,5,6].map((i) => (
                  <span key={i} className="w-1 rounded-full bg-accent animate-pulse"
                    style={{ height: `${30 + (i % 3) * 20}%`, animationDelay: `${i * 90}ms`, animationDuration: "0.7s" }}/>
                ))}
              </div>
            )}

            <h2 className="text-lg font-bold">
              {stage === "ready" ? "Connecting…" :
               stage === "ai-active" ? (aiSpeaking ? "Zentord is speaking" : aiThinking ? "Zentord is thinking…" : "Zentord is listening…") :
               "Connected with support"}
            </h2>
            {stage === "connected" && <p className="text-sm text-muted-foreground mt-1">{fmt(callDuration)}</p>}
            {stage === "ai-active" && <p className="text-sm text-muted-foreground mt-1">A human agent will join shortly.</p>}

            <div className="mt-6 flex justify-center gap-3">
              <Button size="lg" variant="secondary" onClick={toggleMute} className="h-14 w-14 rounded-full p-0" aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <MicOff className="h-5 w-5"/> : <Mic className="h-5 w-5"/>}
              </Button>
              <Button size="lg" variant="secondary" onClick={toggleSpeaker} className="h-14 w-14 rounded-full p-0" aria-label={speakerOn ? "Speaker off" : "Speaker on"}>
                {speakerOn ? <Volume2 className="h-5 w-5"/> : <VolumeX className="h-5 w-5 text-destructive"/>}
              </Button>
              <Button size="lg" variant="destructive" onClick={endCall} className="h-14 w-14 rounded-full p-0" aria-label="End call">
                <PhoneOff className="h-5 w-5"/>
              </Button>
            </div>
          </>)}

          {stage === "ended" && (<>
            <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-secondary mb-4">
              <PhoneOff className="h-6 w-6 text-muted-foreground"/>
            </div>
            <h2 className="text-xl font-bold">Call ended</h2>
            <p className="text-sm text-muted-foreground mt-1">Thanks for reaching out!</p>
          </>)}

          {transcript.length > 0 && (stage === "ai-active" || stage === "connected") && (
            <div className="mt-5 max-h-40 overflow-y-auto text-left text-xs space-y-2 border-t border-border/40 pt-3">
              {transcript.slice(-6).map((t, i) => (
                <div key={i} className={cn("flex", t.from === "you" ? "justify-end" : "justify-start")}>
                  <div className={cn("rounded-2xl px-3 py-1.5 max-w-[80%] leading-snug",
                    t.from === "ai" ? "bg-accent/15 text-foreground rounded-bl-sm" : "bg-primary/15 text-foreground rounded-br-sm")}>
                    <span className={cn("block text-[10px] font-semibold mb-0.5", t.from === "ai" ? "text-accent" : "text-primary")}>
                      {t.from === "ai" ? "Zentord" : "You"}
                    </span>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          )}

        </Card>
      </main>

      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden"/>
    </div>
  );
}
