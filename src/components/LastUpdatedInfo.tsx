// LastUpdatedInfo — Display last updated metadata.
import { formatActivityTime } from "@/lib/activity";
import { User, Clock } from "lucide-react";

interface LastUpdatedInfoProps {
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  className?: string;
}

export function LastUpdatedInfo({
  lastUpdatedBy,
  lastUpdatedAt,
  className = "",
}: LastUpdatedInfoProps) {
  if (!lastUpdatedBy && !lastUpdatedAt) {
    return null;
  }

  return (
    <div className={`flex items-center gap-4 text-sm text-gray-600 ${className}`}>
      {lastUpdatedBy && (
        <div className="flex items-center gap-1.5">
          <User className="h-4 w-4 text-gray-400" />
          <span>
            Updated by <span className="font-medium text-gray-900">{lastUpdatedBy}</span>
          </span>
        </div>
      )}
      {lastUpdatedAt && (
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-gray-400" />
          <span>{formatActivityTime(lastUpdatedAt)}</span>
        </div>
      )}
    </div>
  );
}
