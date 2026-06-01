"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import { arisanList } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";

type State = Awaited<ReturnType<typeof arisanList>>;

const STATUS_TONE = {
  Open: "action" as const,
  Active: "success" as const,
  Done: "neutral" as const,
  Dissolved: "warn" as const,
};

export default function ArisanListScreen() {
  const { t, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/vaults");
  const [st, setSt] = useState<State | null>(null);
  const [, startLoad] = useTransition();

  function refresh() {
    startLoad(async () => setSt(await arisanList()));
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 130,
  };

  return (
    <div style={shell}>
      <AppBar
        leading={
          <IconButton onClick={goBack}>
            {Ico.back({})}
          </IconButton>
        }
        title={t("arisan.title")}
      />

      {/* Preview badge — honest framing */}
      <div style={{ padding: "4px 16px 0", display: "flex", justifyContent: "center" }}>
        <Chip kind="warn" leading={Ico.sparkle({ size: 12, c: "#9a6b1c" })}>
          {t("arisan.previewBadge")}
        </Chip>
      </div>

      {/* Hero copy */}
      <div style={{ padding: "20px 24px 0", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.action }}>
          {t("arisan.kicker")}
        </div>
        <div style={{ marginTop: 6, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
          {t("arisan.heroTitle")}
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: T.slate, lineHeight: 1.5 }}>
          {t("arisan.heroBody")}
        </div>
      </div>

      {/* Action rail */}
      <div style={{ padding: "20px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Btn
          kind="primary"
          onClick={() => router.push("/arisan/new")}
          leading={Ico.plus({ size: 16, c: "#fff" })}
        >
          {t("arisan.createCta")}
        </Btn>
        <Btn
          kind="ghost"
          onClick={() => router.push("/arisan/join")}
          leading={Ico.qr({ size: 16, c: T.ink })}
        >
          {t("arisan.joinCta")}
        </Btn>
      </div>

      {/* My rooms */}
      <div style={{ padding: "24px 16px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate, marginBottom: 8 }}>
          {t("arisan.myRooms")}
        </div>

        {st === null && (
          <div style={{ padding: "30px 0", textAlign: "center", color: T.slate, fontSize: 13 }}>
            {t("common.loading")}
          </div>
        )}

        {st && st.ready && st.mine.length === 0 && (
          <Card p={18}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t("arisan.noneTitle")}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              {t("arisan.noneBody")}
            </div>
          </Card>
        )}

        {st && !st.ready && (
          <Card p={18}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t("arisan.notConfiguredTitle")}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              {t("arisan.notConfiguredBody")}
            </div>
          </Card>
        )}

        {st && st.ready && st.mine.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {st.mine.map((r) => (
              <Card key={r.id} p={14} onClick={() => router.push(`/arisan/${r.id}`)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.name}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: T.slate, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>{r.memberCount}/{r.memberTarget} {t("arisan.members")}</span>
                      <span>·</span>
                      <span>{t("arisan.cadence." + r.cadence)}</span>
                      {r.isHost && (
                        <>
                          <span>·</span>
                          <span style={{ color: T.action, fontWeight: 600 }}>{t("arisan.youHost")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <Chip kind={STATUS_TONE[r.status]}>
                      {t("arisan.status." + r.status)}
                    </Chip>
                    <div style={{ marginTop: 6, fontSize: 12, color: T.slate }}>
                      {t("arisan.pot")} <span style={{ color: T.ink, fontWeight: 600 }}>{formatLocal(r.potPesos, currency)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "30px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
