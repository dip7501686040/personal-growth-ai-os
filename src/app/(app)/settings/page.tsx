import { requireUserId } from "@/lib/user";
import { hasProviderKey } from "@/lib/llm";
import { SELECTABLE_MODELS } from "@/lib/llm/models";
import { choiceKey, getPreferredModel } from "@/modules/settings/service";
import { ModelPicker, type ModelOption } from "@/components/settings/model-picker";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const preferred = await getPreferredModel(userId);
  const current = preferred ? choiceKey(preferred) : "default";

  const options: ModelOption[] = SELECTABLE_MODELS.map((m) => ({
    key: choiceKey(m.choice),
    label: m.label,
    provider: m.choice.provider,
    hasKey: hasProviderKey(m.choice.provider),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configuration for the in-app agents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preferred model</CardTitle>
          <CardDescription>
            The model every agent tries first. The existing Gemini/OpenAI chain
            stays behind it as an automatic fallback on a rate-limit, outage, or
            missing key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelPicker options={options} current={current} />
        </CardContent>
      </Card>
    </div>
  );
}
