import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { type MediaConnection } from "peerjs";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { createPeer, userPeerId, agentPeerId, getHighQualityMicStream, tuneOutgoingAudio } from "@/lib/peer";
import { cn } from "@/lib/utils";
import { Phone, PhoneOff, Mic, MicOff, Loader2, Activity, Headset, Mail, Smartphone, MessageSquare, ShieldX, Globe } from "lucide-react";
import EmployeeStatsBar from "@/components/EmployeeStatsBar";

type WaitingCall = {
  id: string; room_id: string; customer_name: string | null; language: string | null;
  started_at: string; status: string; company_id: string;
  customer_email: string | null; customer_phone: string | null; customer_issue: string | null;
  customer_ip: string | null;
};

export default function AgentQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [waiting, setWaiting] = useState<WaitingCall[]>([]);
  const [active, setActive] = useState<WaitingCall | null>(null);
  const [stats, setStats] = useState({ today: 0, totalSec: 0 });
  const [muted, setMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [blockedIps, setBlockedIps] = useState<Set<string>>(new Set());

  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  // Resolve user → company (employee OR owner)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: emp } = await supabase
        .from("employees").select("id,company_id,companies(name)")
        .eq("user_id", user.id).eq("is_active", true).maybeSingle();
      if (emp) {
        const e = emp as { id: string; company_id: string; companies?: { name: string } | null };
        setEmployeeId(e.id); setCompanyId(e.company_id); setCompanyName(e.companies?.name ?? "");
        return;
      }
      // Owner-as-agent fallback
      const { data: owned } = await supabase.from("companies").select("id,name").eq("owner_id", user.id).maybeSingle();
      if (owned) {
        setCompanyId(owned.id); setCompanyName(owned.name);
        setEmployeeId(`owner-${user.id}`);
      }
    })();
  }, [user]);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from("calls").select("*")
      .eq("company_id", companyId).eq("status", "waiting").order("started_at");
    setWaiting((data ?? []) as WaitingCall[]);

    const since = new Date(); since.setHours(0,0,0,0);
    const { data: today } = await supabase.from("calls").select("duration_seconds")
      .eq("company_id", companyId).gte("started_at", since.toISOString());
    setStats({
      today: today?.length ?? 0,
      totalSec: (today ?? []).reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
    });

    const { data: blocks } = await supabase.from("blocked_ips").select("ip_address").eq("company_id", companyId);
    setBlockedIps(new Set((blocks ?? []).map((b) => b.ip_address)));
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel(`agent-queue-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `company_id=eq.${companyId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, refresh]);

  const teardown = useCallback(() => {
    callRef.current?.close(); callRef.current = null;
    peerRef.current?.destroy(); peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    setCallDuration(0);
  }, []);

  const hangUp = useCallback(async () => {
    if (active) {
      const dur = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;
      await supabase.from("calls").update({
        status: "ended", ended_at: new Date().toISOString(), duration_seconds: dur,
      }).eq("id", active.id);
      // Auto-expire session
      await supabase.from("call_sessions").update({ consumed_at: new Date().toISOString() }).eq("call_id", active.id);
    }
    teardown(); setActive(null); refresh();
  }, [active, refresh, teardown]);

  const pickup = useCallback(async (call: WaitingCall) => {
    if (active || !employeeId) return;
    setPicking(call.id);

    const empUuid = employeeId.startsWith("owner-") ? null : employeeId;
    const { data: claimed, error: claimErr } = await supabase.from("calls")
      .update({ status: "active", employee_id: empUuid, picked_at: new Date().toISOString() })
      .eq("id", call.id).eq("status", "waiting").select().maybeSingle();

    if (claimErr || !claimed) {
      setPicking(null);
      toast({ title: "Already picked", description: "Another agent grabbed this call.", variant: "destructive" });
      refresh(); return;
    }

    try {
      const stream = await getHighQualityMicStream();
      localStreamRef.current = stream;

      const slot = Math.floor(Math.random() * 1000);
      const peer = createPeer(agentPeerId(call.room_id, slot));
      peerRef.current = peer;

      peer.on("open", () => {
        if (!localStreamRef.current) return;
        const outgoing = peer.call(userPeerId(call.room_id), localStreamRef.current);
        if (!outgoing) {
          toast({ title: "Cannot reach customer", variant: "destructive" });
          hangUp(); return;
        }
        callRef.current = outgoing;
        outgoing.on("stream", async (remoteStream) => {
          const pc = (outgoing as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
          if (pc) await tuneOutgoingAudio(pc);
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }
          startedAtRef.current = Date.now();
          durationTimerRef.current = window.setInterval(() => {
            setCallDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
          }, 1000);
          setActive(call); setPicking(null);
        });
        outgoing.on("close", () => hangUp());
      });

      peer.on("error", (err) => {
        console.error("peer error", err);
        toast({ title: "Connection error", description: String((err as { type?: string }).type || err), variant: "destructive" });
        hangUp(); setPicking(null);
      });
    } catch (e) {
      console.error(e);
      const err = e as { name?: string };
      toast({
        title: "Mic error",
        description: err?.name === "NotAllowedError" ? "Allow microphone permission." : "Failed to start call.",
        variant: "destructive",
      });
      await supabase.from("calls").update({ status: "waiting", employee_id: null, picked_at: null }).eq("id", call.id);
      setPicking(null);
    }
  }, [active, employeeId, hangUp, refresh, toast]);

  const blockIp = useCallback(async (ip: string) => {
    if (!companyId || !ip || ip === "0.0.0.0") return;
    if (!confirm(`Block IP ${ip} from all future calls to this company?`)) return;
    setBlocking(ip);
    const { error } = await supabase.from("blocked_ips").insert({
      company_id: companyId, ip_address: ip, reason: "Blocked from agent queue",
    });
    setBlocking(null);
    if (error) {
      toast({ title: "Block failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "IP blocked", description: ip });
      refresh();
    }
  }, [companyId, refresh, toast]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled; setMuted(!track.enabled);
  };

  useEffect(() => () => teardown(), [teardown]);

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  if (!employeeId) {
    return <AppShell title="Agent Queue">
      <Card className="glass border-border/60 p-6">
        <p>You're signed in but not assigned to a company yet. Ask your company admin to add you with this email: <strong>{user?.email}</strong></p>
      </Card>
    </AppShell>;
  }

  return (
    <AppShell title={`Agent Queue ${companyName ? `· ${companyName}` : ""}`}>
      <EmployeeStatsBar employeeId={employeeId} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Card className="glass border-border/60 p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning/15 text-warning"><Phone className="h-5 w-5"/></div>
          <div><div className="text-2xl font-bold">{waiting.length}</div><div className="text-xs text-muted-foreground">Waiting</div></div>
        </Card>
        <Card className="glass border-border/60 p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Activity className="h-5 w-5"/></div>
          <div><div className="text-2xl font-bold">{stats.today}</div><div className="text-xs text-muted-foreground">Today</div></div>
        </Card>
        <Card className="glass border-border/60 p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent"><Headset className="h-5 w-5"/></div>
          <div><div className="text-2xl font-bold">{fmt(stats.totalSec)}</div><div className="text-xs text-muted-foreground">Talk time today</div></div>
        </Card>
      </div>

      {active && (
        <Card className="glass border-primary/40 shadow-glow p-5 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Badge className="bg-primary/15 text-primary border-primary/30 mb-2" variant="outline">Live · {fmt(callDuration)}</Badge>
              <h3 className="font-semibold text-lg">{active.customer_name ?? "Anonymous customer"}</h3>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div className="flex items-center gap-1"><Globe className="h-3 w-3"/>Lang: {active.language ?? "—"} · Room {active.room_id}</div>
                {active.customer_email && <div className="flex items-center gap-1"><Mail className="h-3 w-3"/>{active.customer_email}</div>}
                {active.customer_phone && <div className="flex items-center gap-1"><Smartphone className="h-3 w-3"/>{active.customer_phone}</div>}
                {active.customer_ip && <div className="flex items-center gap-1 font-mono">IP: {active.customer_ip}</div>}
              </div>
              {active.customer_issue && (
                <div className="mt-3 rounded-lg bg-background/60 p-3 text-sm">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1"><MessageSquare className="h-3 w-3"/>Customer issue</div>
                  {active.customer_issue}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="lg" variant="secondary" onClick={toggleMute} className="h-12 w-12 rounded-full p-0">
                {muted ? <MicOff className="h-5 w-5"/> : <Mic className="h-5 w-5"/>}
              </Button>
              <Button size="lg" variant="destructive" onClick={hangUp} className="h-12 w-12 rounded-full p-0">
                <PhoneOff className="h-5 w-5"/>
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="glass border-border/60 p-4">
        <h3 className="font-semibold mb-3">Waiting customers</h3>
        {waiting.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No one waiting. New calls show up here in real-time.</p>}
        <div className="space-y-2">
          {waiting.map((c) => {
            const ipBlocked = c.customer_ip ? blockedIps.has(c.customer_ip) : false;
            return (
              <div key={c.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3", active && "opacity-60")}>
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {c.customer_name ?? "Anonymous"}
                    {c.customer_ip && <Badge variant="outline" className="font-mono text-[10px]">{c.customer_ip}</Badge>}
                    {ipBlocked && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Blocked</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                    <div>Lang: {c.language ?? "—"} · Waiting since {new Date(c.started_at).toLocaleTimeString()}</div>
                    {c.customer_email && <div>📧 {c.customer_email}</div>}
                    {c.customer_phone && <div>📱 {c.customer_phone}</div>}
                    {c.customer_issue && <div className="line-clamp-2">💬 {c.customer_issue}</div>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.customer_ip && !ipBlocked && (
                    <Button size="sm" variant="outline" onClick={() => blockIp(c.customer_ip!)} disabled={blocking === c.customer_ip}>
                      {blocking === c.customer_ip ? <Loader2 className="h-4 w-4 animate-spin"/> : <><ShieldX className="h-4 w-4 mr-1"/>Block IP</>}
                    </Button>
                  )}
                  <Button onClick={() => pickup(c)} disabled={!!active || picking === c.id} className="bg-gradient-primary text-primary-foreground">
                    {picking === c.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Phone className="h-4 w-4 mr-1"/>Pick up</>}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden"/>
    </AppShell>
  );
}
