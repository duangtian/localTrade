/** คะแนน Bot 0–100: ตัวเลข + แถบเล็ก (สีบอกระดับ และมีตัวเลขกำกับเสมอ) */
export function scoreTone(score: number): "up" | "down" | "muted" {
  return score >= 58 ? "up" : score < 45 ? "down" : "muted";
}

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tone = scoreTone(score);
  const bar = tone === "up" ? "bg-emerald-400" : tone === "down" ? "bg-rose-400" : "bg-ink-muted";
  return (
    <span className={`inline-flex shrink-0 flex-col items-end ${size === "lg" ? "w-20" : "w-14"}`} aria-label={`คะแนน ${score} จาก 100`}>
      <span className={`${size === "lg" ? "text-3xl" : "text-xl"} font-semibold leading-none`}>
        {score}
        <span className="muted text-[0.7rem] font-normal">/100</span>
      </span>
      <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
        <span className={`block h-full ${bar}`} style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}

export function ToneDot({ tone }: { tone: "pos" | "neg" | "neu" }) {
  const map = {
    pos: { c: "up", s: "▲", l: "บวก" },
    neg: { c: "down", s: "▼", l: "ลบ" },
    neu: { c: "muted", s: "–", l: "กลาง" },
  }[tone];
  return (
    <span className={`${map.c} w-3 shrink-0 text-[0.75rem] leading-[1.6rem]`} aria-label={map.l}>
      {map.s}
    </span>
  );
}
