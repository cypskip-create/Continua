import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Legend } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { KeyInfoUpdates } from "./KeyInfoUpdates";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";

interface Props { symbol: string }

/** Continua's data layer doesn't ingest executive biography, tenure,
 *  compensation, or board-composition data at all — there's no source
 *  for it anywhere in the pipeline (unlike valuation, financials, and
 *  dividends, which are all real elsewhere in this report). The one
 *  real field available is the CEO's name from the company profile;
 *  everything else here is honestly "no data" rather than invented. */
export function ManagementSection({ symbol }: Props) {
  const { profile, isLoading } = useCompanyProfile(symbol);
  const ceo = profile?.company.ceo;

  return (
    <ReportSection number={7} title="Management">
      <CriteriaChecklist
        checks={[
          { label: "CEO identified", status: ceo ? "pass" : "unknown" },
          { label: "CEO tenure on file", status: "unknown" },
          { label: "CEO compensation on file", status: "unknown" },
          { label: "Board composition on file", status: "unknown" },
        ]}
        narrative="Continua doesn't ingest executive biography, tenure, compensation, or board-composition data yet — this section is shown so the tool is visibly present rather than silently missing, not filled with invented figures."
      />

      <KeyInfoUpdates
        rows={[
          { label: "CEO", value: isLoading ? "…" : ceo || "n/a", highlight: true },
          { label: "CEO tenure", value: "n/a" },
          { label: "Total compensation", value: "n/a" },
          { label: "Board average tenure", value: "n/a" },
        ]}
        updates={[]}
        updatesTitle="Recent management updates"
      />

      <SubWidget number="7.1" title="CEO Compensation Analysis" description="Total compensation, salary, and company earnings over time — needs an executive-compensation disclosure feed Continua doesn't have yet.">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[]}>
              <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line dataKey="Total Compensation" stroke="hsl(217 91% 60%)" strokeWidth={2} />
              <Line dataKey="Salary" stroke="hsl(160 84% 58%)" strokeWidth={2} />
              <Line dataKey="Company Earnings" stroke="hsl(38 92% 50%)" strokeWidth={2} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">No executive compensation data on file for {symbol} yet — chart is ready to populate once a source exists.</p>
      </SubWidget>
    </ReportSection>
  );
}