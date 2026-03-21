import { Badge } from "@/components/ui/Badge";
import { TaskStatus, STATUS_LABELS } from "@/lib/types";

const statusVariants: Record<TaskStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  created: "default",
  assigned: "info",
  in_progress: "warning",
  submitted: "info",
  under_review: "warning",
  approved: "success",
  rejected: "danger",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant={statusVariants[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
