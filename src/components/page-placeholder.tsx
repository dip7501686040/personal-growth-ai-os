import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PagePlaceholder({
  title,
  description,
  phase,
  points,
}: {
  title: string;
  description: string;
  phase: string;
  points?: string[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {phase}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not built yet</CardTitle>
          <CardDescription>
            This page is a placeholder. Functionality lands in {phase}.
          </CardDescription>
        </CardHeader>
        {points && points.length > 0 && (
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
