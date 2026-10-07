import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IngestionStatusDto } from "@/services/ingestionStatus";

/**
 * Shown only when the call sender's most recent request was turned away (wrong
 * secret, malformed payload...) and nothing has succeeded since. Quiet periods
 * with no calls are normal and show nothing.
 */
export function WebhookAlert({ status }: { status: IngestionStatusDto | undefined }) {
  const rejection = status?.recentRejection;
  if (!rejection) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className="h-6 cursor-default border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
            tabIndex={0}
          />
        }
      >
        <ShieldAlert aria-hidden data-icon="inline-start" />
        Webhook rejected
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        The last request from the call sender was rejected: {rejection.reason}. New calls will not
        appear until this is fixed.
      </TooltipContent>
    </Tooltip>
  );
}
