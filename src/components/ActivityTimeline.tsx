// ActivityTimeline — Timeline component for displaying activity logs.
import { formatActivityTime, getActivityDescription, type ActivityLog } from "@/lib/activity";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface ActivityTimelineProps {
  activities: ActivityLog[];
  className?: string;
}

export function ActivityTimeline({ activities, className = "" }: ActivityTimelineProps) {
  if (!activities || activities.length === 0) {
    return (
      <Card className={`p-4 text-center text-gray-500 ${className}`}>
        <p>No activity history yet.</p>
      </Card>
    );
  }

  // Sort newest first
  const sorted = [...activities].reverse();

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="divide-y">
        {sorted.map((log, idx) => (
          <div key={log.id || idx} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 mt-1 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {log.actor}
                  </Badge>
                  <span className="text-sm font-medium">{getActivityDescription(log)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{formatActivityTime(log.timestamp)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
