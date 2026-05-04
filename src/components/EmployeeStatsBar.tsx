// Personal stats for the signed-in agent: total handled calls, today's calls,
// total talk time, and a snapshot of recent customer issues.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Phone, Headset, Calendar, MessageSquare } from "lucide-react";

type Stats = {
  total: number;
  today: number;
  totalSec: number;
  todaySec: number;
  recent: { id: string; customer_name: string | null; issue: string | null; duration: number | null; ended_at: string | null }[];
};

export default function EmployeeStatsBar({ employeeId }: { employeeId: string | null }) {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    if (!employeeId || employeeId.startsWith("owner-")) { setS(null); return; }
    (async () => {
      const since = new Date(); since.setHours(0,0,0,0);
      const [{ data: total }, { data: recent }] = await Promise.all([
        supabase.from("calls").select("duration_seconds, started_at").eq("employee_id", employeeId),
        supabase.from("calls")
          .select("id, customer_name, customer_issue, duration_seconds, ended_at")
          .eq("employee_id", employeeId)
          .order("ended_at", { ascending: false, nullsFirst: false })
          .limit(5),
      ]);
      const all = total ?? [];
      const todayRows = all.filter((c) => new Date(c.started_at) >= since);
      setS({
        total: all.length,
        today: todayRows.length,
        totalSec: all.reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
        todaySec: todayRows.reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
        recent: (recent ?? []).map((r) => ({
          id: r.id, customer_name: r.customer_name, issue: r.customer_issue,
          duration: r.duration_seconds, ended_at: r.ended_at,
        })),
      });
    })();
  }, [employeeId]);

  if (!employeeId || employeeId.startsWith("owner-") || !s) return null;

  const fmt = (sec: number) => {
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), ss = sec%60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${ss}s` : `${ss}s`;
  };

  return (
    <Card className="glass border-border/60 p-5 mb-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><Headset className="h-4 w-4 text-primary"/>Your performance</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Mini icon={Phone} label="Total calls" value={s.total.toString()} />
        <Mini icon={Calendar} label="Today" value={s.today.toString()} />
        <Mini icon={Activity} label="Talk time today" value={fmt(s.todaySec)} />
        <Mini icon={Headset} label="Total talk time" value={fmt(s.totalSec)} />
      </div>
      {s.recent.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <MessageSquare className="h-3 w-3"/>Last {s.recent.length} call{s.recent.length === 1 ? "" : "s"}
          </div>
          <div className="space-y-2">
            {s.recent.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 p-2.5 bg-background/40">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium truncate">{r.customer_name ?? "Anonymous"}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.duration != null && <Badge variant="outline" className="text-[10px]">{fmt(r.duration)}</Badge>}
                    <span className="text-[10px] text-muted-foreground">{r.ended_at ? new Date(r.ended_at).toLocaleString() : "—"}</span>
                  </div>
                </div>
                {r.issue && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.issue}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Mini({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3 bg-background/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5"/>{label}
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
