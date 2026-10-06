"use client";
import { useT } from "@/components/I18nProvider";
import { isLocalPreview } from "@/lib/local-preview";
import { paymentChannels, paymentChannelSupported, type PaymentChannelId, type PaymentProviderId } from "@/lib/payment-channels";
import { paymentChannelText } from "@/lib/i18n/payment-channels";
import styles from "./PaymentChannelOptions.module.css";

export type PaymentChannelOptionsProps = {
  payout: boolean;
  value?: PaymentChannelId;
  onChange?: (id: PaymentChannelId) => void;
  provider?: PaymentProviderId;
};
export default function PaymentChannelOptions({ payout, value, onChange, provider = "xendit" }: PaymentChannelOptionsProps) {
  const { locale } = useT();
  const interactive = isLocalPreview && !!onChange;
  return <section className={styles.section} aria-label={paymentChannelText(locale, payout ? "payoutMethods" : "methods")}>
    <h2>{paymentChannelText(locale, payout ? "payoutMethods" : "methods")}</h2>
    <div className={styles.options}>{paymentChannels(payout).map(channel => {
      const supported = paymentChannelSupported(channel.id, provider, payout);
      const disabled = !interactive || !supported;
      const title = channel.id === "bank-wallet" ? paymentChannelText(locale, "bankWallet") : channel.id === "gcash" ? "GCash" : "QRIS";
      const explanation = payout && channel.id === "qris" ? paymentChannelText(locale, "qrisPayout")
        : !interactive ? paymentChannelText(locale, "readonly")
        : !supported ? paymentChannelText(locale, "unsupported") : paymentChannelText(locale, "local");
      return <button type="button" key={channel.id} data-payment-channel={channel.id} disabled={disabled}
        aria-pressed={interactive ? value === channel.id : undefined} className={value === channel.id && interactive ? styles.selected : undefined}
        onClick={() => { if (!disabled && paymentChannelSupported(channel.id, provider, payout)) onChange?.(channel.id); }}>
        <span className={styles.mark} aria-hidden="true">{channel.id === "gcash" ? "G" : channel.id === "qris" ? "QR" : "↗"}</span>
        <span className={styles.words}><strong>{title}</strong><small>{explanation}</small></span><span className={styles.currency}>{channel.code}</span>
      </button>;
    })}</div><p className={styles.note}>{paymentChannelText(locale, "notMoney")}</p>
  </section>;
}
