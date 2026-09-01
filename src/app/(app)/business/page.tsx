import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { listOpportunities } from "@/modules/business/service";
import { GenerateForm } from "@/components/business/generate-form";
import { NewOpportunityDialog } from "@/components/business/new-opportunity-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Business Opportunities" };

const COLUMNS = [
  { status: "idea", label: "Ideas" },
  { status: "exploring", label: "Exploring" },
  { status: "validated", label: "Validated" },
  { status: "dropped", label: "Dropped" },
];

const COMPLEXITY_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "outline",
};

export default async function BusinessPage() {
  const userId = await requireUserId();
  const opps = await listOpportunities(userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Business Opportunities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Small software/AI products you could build solo and sell to local
            businesses — matched to skills you can actually ship.
          </p>
        </div>
        <NewOpportunityDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateForm />
        </CardContent>
      </Card>

      {opps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            None yet. Generate some, or add one manually.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {COLUMNS.map(({ status, label }) => {
            const col = opps.filter((o) => o.status === status);
            if (col.length === 0) return null;
            return (
              <section key={status} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {label} ({col.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {col.map((o) => (
                    <Link
                      key={o.id}
                      href={`/business/${o.id}`}
                      className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{o.title}</span>
                        <Badge
                          variant={COMPLEXITY_VARIANT[o.complexity] ?? "outline"}
                        >
                          {o.complexity}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {o.problem}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        skill match {o.skillMatchScore}%
                        {o.monetizationModel ? ` · ${o.monetizationModel}` : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
