"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/kit";
import styles from "./PrototypeFeeStory.module.css";

export type FeeStorySlide = { title: string; body: string; art: string };
const art = (name: string) => `/prototype-fee-story/story-${name}.png`;

const ORGANIZER_STORY: FeeStorySlide[] = [
  { title: "Helping is real work", body: "Shopping, packing, riding, delivering, posting proof. Running a cause takes your time, your energy and your money.", art: art("work") },
  { title: "How a D4 contribution is used", body: "The full contribution enters that campaign's own escrow. Its creator share (0–10%) and beneficiary are fixed before funding opens.", art: art("split") },
  { title: "Your share is fixed up front", body: "The creator share is released only after two of the three configured wallets approve the submitted proof before the deadline. Donor ratings are not part of D4.", art: art("share") },
  { title: "Or make it 0%", body: "If your costs are covered, or you'd like to give your time as a gift, set it to 0%. Both choices are welcome.", art: art("gift") },
  { title: "No platform fee in D4", body: "The D4 campaign contract does not deduct a Salapi platform fee from campaign contributions.", art: art("salapi") },
  { title: "Disaster Vault is separate", body: "The Vault uses its own D3 contract and safety rules. A D4 campaign contribution does not automatically add to it; people can contribute to the Vault separately.", art: art("vault") },
  { title: "One helper inspires the next", body: "When helping pays fairly, more people can make it their work, and more families get help.", art: art("helpers") },
];

const DONOR_START = { organizer: 0, platform: 3, cause: 5 } as const;
export type DonorStoryKey = keyof typeof DONOR_START;
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const donorFeeStory = (amountCents: number, creatorShareBps: number): FeeStorySlide[] => {
  const creatorShare = Math.round(amountCents * creatorShareBps / 10_000);
  const beneficiaryShare = amountCents - creatorShare;
  const percent = (creatorShareBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return [
    { art: art("work"), title: "Helping takes real work", body: "The organizer shops, travels, delivers the help and posts proof, often over many days." },
    { art: art("share"), title: "The creator share is set first", body: "Each D4 campaign fixes its creator share from 0–10% before funding opens. The share cannot be raised later." },
    { art: art("split"), title: `Where your ${usd(amountCents)} goes`, body: `${usd(amountCents)} is held in this campaign's D4 escrow. These example terms set a ${percent}% creator share (${usd(creatorShare)}). If proof is approved, ${usd(beneficiaryShare)} goes to the fixed beneficiary and ${usd(creatorShare)} to the creator.` },
    { art: art("salapi"), title: "No platform fee in D4", body: "The D4 campaign contract does not deduct a Salapi platform fee. This preview does not add one either." },
    { art: art("vault"), title: "Disaster Vault is separate", body: "D3 has a separate shared pool and approval process. D4 campaign donations do not automatically fund it; a Vault contribution is a separate action." },
    { art: art("two-steps"), title: "Two of three wallets approve proof", body: "After funding closes, the organizer submits proof. Two of the three wallets fixed at campaign creation must approve the same proof before the deadline. This is not a donor rating." },
    { art: art("refund"), title: "You can claim a refund", body: "If two timely approvals are not recorded, each donor can claim their full contribution after the review deadline. Refunds are not automatic and network fees are not returned." },
    { art: art("helpers"), title: "Fair pay keeps helpers going", body: "For many organizers, helping is their daily work. A small, visible share lets them support their own families while they help others, and inspires more people to start." },
  ];
};

export default function PrototypeFeeStory({ onDone, slides = ORGANIZER_STORY, start = 0, ariaLabel = "Organizer fee story" }: {
  onDone: () => void;
  slides?: FeeStorySlide[];
  start?: number;
  ariaLabel?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const last = at === slides.length - 1;
  const left = (index: number) => (track.current?.children[index] as HTMLElement | undefined)?.offsetLeft ?? 0;
  useLayoutEffect(() => { if (track.current) track.current.scrollLeft = left(start); }, [start]);
  const go = (index: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    track.current?.scrollTo({ left: left(target), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const onScroll = () => {
    const element = track.current;
    if (!element) return;
    let nearest = 0;
    for (let index = 1; index < element.children.length; index++) if (Math.abs(left(index) - element.scrollLeft) < Math.abs(left(nearest) - element.scrollLeft)) nearest = index;
    if (nearest !== at) setAt(nearest);
  };

  return <div className={styles.slider}>
    <div ref={track} className={styles.track} role="group" aria-roledescription="carousel" aria-label={ariaLabel} tabIndex={0} onScroll={onScroll} onKeyDown={event => { if (event.key === "ArrowRight") go(at + 1); if (event.key === "ArrowLeft") go(at - 1); }}>
      {slides.map((slide, index) => <figure key={slide.title} className={styles.slide} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`} aria-hidden={index !== at}>
        <img src={slide.art} alt="" width="400" height="300" draggable={false} />
        <figcaption><span className={styles.count}>{index + 1} / {slides.length}</span><strong>{slide.title}</strong><p>{slide.body}</p></figcaption>
      </figure>)}
    </div>
    <div className={styles.dots} role="group" aria-label={`Slide ${at + 1} of ${slides.length}`}>
      {slides.map((slide, index) => <button key={slide.title} type="button" aria-label={`Slide ${index + 1}`} aria-current={index === at || undefined} onClick={() => go(index)} />)}
    </div>
    <Btn onClick={() => last ? onDone() : go(at + 1)}>{last ? "Got it" : "Next"}</Btn>
  </div>;
}

export const donorStoryStart = DONOR_START;
