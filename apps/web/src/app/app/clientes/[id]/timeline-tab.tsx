import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerTimeline } from "@/domains/customers/components/customer-timeline";
import { timelineEventLabel } from "@/domains/customers/labels";
import type { TimelineEventRow } from "@/domains/customers/queries";

export function TimelineTab({ timeline }: { timeline: TimelineEventRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline completa</CardTitle>
      </CardHeader>
      <CardContent>
        <CustomerTimeline events={timeline} labelFor={timelineEventLabel} />
      </CardContent>
    </Card>
  );
}
