"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ShareNetwork, ArrowSquareOut } from "@phosphor-icons/react";
import { listPreviewTransfers, type PreviewTransfer } from "@/lib/local-preview-history";
import styles from "./PrototypeActivityDetailScreen.module.css";

type Receipt = { title: string; amount: string; person: string; status: string; rows: [string, string][]; about?: { label: string; href: string } };
const SAMPLE: Record<string, Receipt> = {
  a1: { title:"Donation", amount:"−$5.00", person:"Ate Mei needs dialysis", status:"Confirmed", rows:[["To","@meis_family"],["Date","Today, 9:41"],["Cause receives","$4.65"],["Organizer fee · 5%","$0.25"],["Disaster Vault · 1%","$0.05"],["Platform fee · 1%","$0.05"],["Total","$5.00"]], about:{label:"View cause",href:"/cause/mei"} },
  a2: { title:"Transfer", amount:"−$5.00", person:"@jamamam", status:"Confirmed", rows:[["To","@jamamam"],["Date","Today, 8:41"],["Amount","$5.00"]], about:{label:"Send again",href:"/send?to=jamamam"} },
  a3: { title:"Top up", amount:"+$5.00", person:"QRIS", status:"Credited", rows:[["Method","QRIS"],["Date","Yesterday, 16:20"],["Paid","Rp 82,500"],["Rate","Rp 16,500 per $1"]] },
  a4: { title:"Transfer", amount:"+$12.00", person:"@jamal_r", status:"Confirmed", rows:[["From","@jamal_r"],["Date","Yesterday, 11:05"],["Amount","$12.00"]], about:{label:"Send to @jamal_r",href:"/send?to=jamal_r"} },
  a5: { title:"Withdrawal", amount:"−$439.94", person:"Withdrawal arrived", status:"Completed", rows:[["Date","12 Nov, 14:32"],["Amount","$439.94"],["To","GCash · •••• 4567"],["Fee","Free"]] },
  "referral-reward": { title:"Referral reward", amount:"+$20.00", person:"Salapi", status:"Confirmed", rows:[["From","Salapi"],["Reward for","10 friends who each donated $5 or more"],["Date","Today"],["Amount","$20.00 USDC"],["Status","Added to your balance"]], about:{label:"View referrals",href:"/you/referrals?state=earned"} },
};

function sampleHash(id: string) {
  let hash = 2166136261;
  let output = "";
  for (let i = 0; i < 16; i++) {
    for (const character of id + i) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    output += (hash >>> 0).toString(16).padStart(8, "0").slice(0, 4);
  }
  return output;
}

export default function PrototypeActivityDetailScreen({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const [transfer, setTransfer] = useState<PreviewTransfer | null>(null);
  useEffect(() => { if (id.startsWith("local-send-")) setTransfer(listPreviewTransfers().find(item => item.id === id) ?? null); }, [id]);
  const receipt = SAMPLE[id];
  const receiptId = sampleHash(id);
  const title = transfer ? "Transfer" : receipt?.title ?? "Activity";
  const amount = transfer ? `−${new Intl.NumberFormat("en-US", { maximumFractionDigits:2 }).format(transfer.pesos)}` : receipt?.amount ?? "";
  const person = transfer ? `@${transfer.recipientHandle}` : receipt?.person ?? "";
  const rows = transfer ? [["To", `@${transfer.recipientHandle}`], ["Status", "Local demo · no tokens moved"], ["Native amount", `${Number(transfer.amountStroops) / 10_000_000} Testnet XLM`], ["Recipient wallet", transfer.recipientAddress]] as [string,string][] : receipt?.rows ?? [];

  async function copyId() {
    try { await navigator.clipboard.writeText(receiptId); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); }
  }
  async function share() {
    const data = { title: "Salapi receipt", text: `${title} · ${amount} · ${person}` };
    try { if (navigator.share) await navigator.share(data); else await navigator.clipboard.writeText(data.text); } catch { /* User can close a cancelled native share sheet. */ }
  }

  return <div className={styles.screen}>
    <header className={styles.header}><Link href="/activity" aria-label="Back"><ArrowLeft size={20} /></Link><h1>{title}</h1><span /></header>
    <section className={styles.hero}>
      <span className={styles.mark} aria-hidden="true">·</span>
      <strong>{amount}</strong><b>{person}</b><span className={styles.status}>{transfer ? "Local demo · no tokens moved" : receipt?.status ?? "Sample receipt"}</span>
    </section>
    <section className={styles.receipt} aria-label="Receipt details">
      {rows.map(([label,value]) => <div className={`${styles.row} ${label === "Total" ? styles.total : ""}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}
      <div className={styles.row}><span>Receipt ID</span><button type="button" className={styles.copy} onClick={copyId}><span>{receiptId.slice(0,8)}…{receiptId.slice(-4)}</span>{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div>
    </section>
    {receipt?.about ? <Link className={styles.about} href={receipt.about.href}>{receipt.about.label}<ArrowSquareOut size={16}/></Link> : null}
    <p className={styles.disclosure}>Sample receipt for the UI preview. It is not a real Stellar transaction.</p>
    <div className={styles.actions}><Link href="/activity" className={styles.done}>Done</Link><button type="button" className={styles.share} onClick={() => void share()}><ShareNetwork size={17}/>Share</button></div>
  </div>;
}
