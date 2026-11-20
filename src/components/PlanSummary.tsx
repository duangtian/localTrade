import { StockBadge } from "@/components/StockBadge";
import { DAY_TAG } from "@/lib/analysis/allocate";
import type { Plan } from "@/lib/analysis/planner";
import { fmtMoney, fmtQty } from "@/lib/format";

const pct = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}%`;
type Item = Plan["items"][number];

/** ขาดทุนถ้าโดน stop / กำไรถ้าถึงเป้า (บาท โดยประมาณ ก่อนค่าคอมขาขาย) */
function riskReward(it: Item) {
  const risk = it.stop ? (it.costThb * (it.price - it.stop)) / it.price : 0;
  const reward = it.target ? (it.costThb * (it.target - it.price)) / it.price : 0;
  return { risk, reward };
}

function Heading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h4 className="mb-2 mt-5 flex items-center gap-2 text-[0.95rem] font-semibold first:mt-0">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[0.75rem]" aria-hidden>
        {n}
      </span>
      {children}
    </h4>
  );
}

function Tile({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
      <div className="faint text-[0.75rem]">{label}</div>
      <div className="text-[1.15rem] font-semibold leading-tight">{children}</div>
      {sub && <div className="faint mt-0.5 text-[0.75rem]">{sub}</div>}
    </div>
  );
}

export function PlanSummary({ plan, ai }: { plan: Plan; ai: boolean }) {
  const day = plan.options.style === "day";
  const backtest = plan.mode === "backtest";
  const items = plan.items;
  const sectors = new Set(items.map((i) => i.sector));
  const totals = items.reduce((a, it) => {
    const r = riskReward(it);
    return { risk: a.risk + r.risk, reward: a.reward + r.reward };
  }, { risk: 0, reward: 0 });
  const usedPct = plan.cashThb > 0 ? plan.usedThb / plan.cashThb : 0;
  const hasUS = items.some((i) => i.market === "US");
  const hasLimit = items.some((i) => i.orderType === "limit");

  if (items.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold">แผนที่เสนอ · {day ? "เดย์เทรด" : "ถือยาว"}</h3>
        <p className="mt-2">ยังไม่มีหุ้นที่เข้าเงื่อนไข</p>
        <p className="muted mt-1 text-[0.9rem]">{plan.commentary}</p>
      </div>
    );
  }

  const steps: string[] = [];
  if (plan.exchangeThb > 0) steps.push(`แลกเงิน ${fmtMoney(plan.exchangeThb)} เป็น USD สำหรับหุ้นสหรัฐฯ`);
  if (day && backtest) {
    steps.push("ซื้อทุกตัวที่ราคาเปิดของวันจำลอง");
    steps.push("จำลองระหว่างวัน: ราคาลงแตะ stop → ขายตัดขาดทุน · ราคาขึ้นแตะเป้า → ขายทำกำไร (ถ้าแตะทั้งคู่ ถือว่าโดน stop ก่อน)");
    steps.push("ไม่แตะทั้งคู่ → ขายที่ราคาปิด");
    steps.push("เห็นผลกำไร/ขาดทุนของแต่ละตัวทันทีหลังกดยืนยัน");
  } else if (day) {
    steps.push("ส่งคำสั่งซื้อแบบ Market ทุกตัวทันที พร้อมบันทึก stop-loss และเป้า");
    steps.push("ระบบไม่ขายให้อัตโนมัติ: กลับมาที่หน้านี้ ส่วน \"ดูแลพอร์ต\" จะบอกเมื่อถึง stop / เป้า");
    steps.push("ก่อนตลาดปิด 30 นาที จะมีคำแนะนำให้ขายปิดสถานะทุกตัว");
  } else {
    steps.push(hasLimit ? "ตลาดปิดอยู่: ตั้งคำสั่ง Limit ที่ราคาปัจจุบัน รอจับคู่ตอนตลาดเปิด" : backtest ? "ซื้อที่ราคาปิดของวันจำลอง" : "ส่งคำสั่งซื้อแบบ Market ทุกตัวทันที");
    steps.push("บันทึก stop-loss และเป้าหมายของทุกตัวไว้ในคำสั่ง");
    steps.push("ระบบไม่ขายให้อัตโนมัติ: เปิดหน้านี้เป็นระยะ ส่วน \"ดูแลพอร์ต\" จะเสนอขายเมื่อหลุด stop / ถึงเป้า / แนวโน้มเสีย");
  }

  const warnings: string[] = [];
  if (day) {
    warnings.push("ค่าคอมเกิดทั้งขาซื้อและขายทุกไม้ เดย์เทรดต้องชนะบ่อยพอจะชดเชยค่าคอม");
    warnings.push(`กำไร:ขาดทุน = 1.5 : 1 ต้องชนะมากกว่า 40% ของไม้จึงจะคุ้ม (ก่อนค่าคอม)`);
    if (!backtest) warnings.push("ราคาในแอปช้ากว่าตลาดจริงประมาณ 15 นาที ราคาที่ได้จริงอาจต่างจากที่เห็น");
  } else {
    warnings.push("คะแนนดูจากราคาในอดีต หุ้นที่แนวโน้มดีอาจกลับตัวลงได้ทุกเมื่อ");
    if (sectors.size <= 2) warnings.push(`หุ้นอยู่แค่ ${sectors.size} กลุ่ม ถ้ากลุ่มนี้แย่ พอร์ตจะโดนพร้อมกันหลายตัว`);
  }
  if (hasUS) warnings.push("หุ้นสหรัฐฯ มีความเสี่ยงค่าเงินบาท/ดอลลาร์เพิ่มเข้ามา");

  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">แผนที่เสนอ · {day ? "เดย์เทรด" : "ถือยาว"}</h3>
        <span className="faint text-[0.8rem]">{backtest ? `วันจำลอง ${plan.today}` : "เวลาจริง"}</span>
      </div>

      <Heading n={1}>ภาพรวม</Heading>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="ใช้เงิน" sub={`${(usedPct * 100).toFixed(0)}% ของเงินสด`}>
          {fmtMoney(plan.usedThb)}
        </Tile>
        <Tile label="เงินสดคงเหลือ" sub="เก็บไว้ใช้ภายหลัง">
          {fmtMoney(Math.max(0, plan.cashThb - plan.usedThb))}
        </Tile>
        <Tile label="จำนวนหุ้น" sub={`ตั้งไว้สูงสุด ${plan.options.maxPositions} ตัว`}>
          {items.length} ตัว
        </Tile>
        <Tile label="กลุ่มอุตสาหกรรม">{sectors.size} กลุ่ม</Tile>
      </div>

      {items.length < plan.options.maxPositions && (
        <p className="note mt-2">
          <b>ทำไมได้ {items.length} ตัว ไม่ครบ {plan.options.maxPositions}:</b>{" "}
          {plan.checked !== undefined && plan.matched !== undefined
            ? `ตรวจ ${plan.checked} ตัว เข้าเงื่อนไข${day ? "เดย์เทรดวันนี้" : "สถิติ"} ${plan.matched} ตัว`
            : "มีหุ้นเข้าเงื่อนไขไม่ครบ"}
          {plan.matched !== undefined && plan.matched > items.length ? ` และซื้อได้จริง ${items.length} ตัว (ติดงบต่อตัว, ซื้อทีละ 100 หุ้น หรือจำกัดต่อกลุ่ม)` : ""} ระบบไม่ฝืนซื้อตัวที่ไม่เข้าเงื่อนไขให้ครบจำนวน ดูเหตุผลของแต่ละตัวได้ที่ &quot;ตัวที่ข้าม&quot; ด้านล่าง
        </p>
      )}

      <Heading n={2}>ความเสี่ยงและผลตอบแทน (ประมาณ)</Heading>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="ถ้าทุกตัวโดน stop-loss" sub={`${pct(-totals.risk / Math.max(1, plan.usedThb))} ของเงินที่ใช้`}>
          <span className="down">−{fmtMoney(totals.risk)}</span>
        </Tile>
        <Tile label="ถ้าทุกตัวถึงเป้าหมาย" sub={`${pct(totals.reward / Math.max(1, plan.usedThb))} ของเงินที่ใช้`}>
          <span className="up">+{fmtMoney(totals.reward)}</span>
        </Tile>
      </div>
      <p className="faint mt-1 text-[0.75rem]">ยังไม่หักค่าคอมขาขาย</p>

      <Heading n={3}>กฎของแผนนี้</Heading>
      <ul className="list-disc space-y-1 pl-5 text-[0.9rem]">
        {day ? (
          <>
            <li>เข้าซื้อเมื่อมีสัญญาณวันนี้ (ราคากระโดดขึ้นในแนวโน้มขาขึ้น)</li>
            <li>ตัดขาดทุนที่ −2% · ขายทำกำไรที่ +3%</li>
            <li>ปิดสถานะทุกตัวภายในวัน ไม่ถือข้ามคืน</li>
            <li>ไม่เกิน 34% ของพอร์ตต่อตัว</li>
          </>
        ) : (
          <>
            <li>เลือกเฉพาะหุ้นคะแนนสถิติ ≥ 58 ที่ไม่ใช่ขาลง และไม่ร้อนแรงเกินไป (RSI &lt; 75)</li>
            <li>ไม่เกิน 25% ของพอร์ตต่อตัว และไม่เกิน 2 ตัวต่อกลุ่ม</li>
            <li>stop-loss ตั้งตามความผันผวนจริงของแต่ละตัว เป้าหมาย = 2 เท่าของระยะ stop</li>
          </>
        )}
      </ul>

      <Heading n={4}>กดยืนยันแล้วจะเกิดอะไร</Heading>
      <ol className="list-decimal space-y-1 pl-5 text-[0.9rem]">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <Heading n={5}>ข้อควรระวัง</Heading>
      <ul className="space-y-1 text-[0.9rem]">
        {warnings.map((w) => (
          <li key={w} className="note-warn">
            {w}
          </li>
        ))}
      </ul>

      {plan.byAi && (
        <>
          <Heading n={6}>AI (Claude) อธิบาย</Heading>
          <p className="inset whitespace-pre-line text-[0.95rem]">{plan.commentary}</p>
        </>
      )}
      {!plan.byAi && <p className="faint mt-4 text-[0.8rem]">{ai ? "AI ไม่ตอบในรอบนี้ ใช้สรุปของ Bot" : "สรุปโดย Bot · เปิด Claude ในหน้าตั้งค่าเพื่อให้ AI อธิบายเพิ่ม"}</p>}
    </div>
  );
}

/** การ์ดหุ้นแต่ละตัวในแผน: ตัวเลขสำคัญเป็นช่อง และเหตุผลเป็นข้อ ๆ */
export function PlanItemCard({ it }: { it: Item }) {
  const cur = it.market === "TH" ? "THB" : "USD";
  const { risk, reward } = riskReward(it);
  const reasons = it.reason.startsWith(DAY_TAG)
    ? it.reason
        .replace(DAY_TAG, "")
        .split(" · ")
        .map((x) => x.trim())
        .filter((x) => x && !/^(ตัดขาดทุน|เป้า|ปิดสถานะ)/.test(x))
    : [`คะแนนสถิติ ${it.score}/100 (${it.trendLabel})`, ...(it.r6m !== null ? [`ผลตอบแทน 6 เดือน ${pct(it.r6m)}`] : []), `กลุ่ม${it.sector}`];
  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <StockBadge symbol={it.symbol} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{it.symbol.replace(".BK", "")}</p>
          <p className="muted text-[0.85rem] leading-snug">
            {it.name} · {it.sector}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">{it.qty ? `${fmtQty(it.qty)} หุ้น` : fmtMoney(it.amountUsd!, "USD")}</p>
          <p className="faint text-[0.8rem]">≈ {fmtMoney(it.costThb)}</p>
          <p className="faint text-[0.8rem]">{(it.weightAfter * 100).toFixed(0)}% ของพอร์ต</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/20 p-2">
          <div className="faint text-[0.7rem]">{it.orderType === "limit" ? "ราคา Limit" : "ราคาเข้า"}</div>
          <div className="font-semibold">{fmtMoney(it.price, cur)}</div>
        </div>
        <div className="rounded-xl bg-black/20 p-2">
          <div className="faint text-[0.7rem]">Stop-loss</div>
          <div className="down font-semibold">{it.stop ? fmtMoney(it.stop, cur) : "–"}</div>
          {it.stop && <div className="faint text-[0.7rem]">{pct(it.stop / it.price - 1)}</div>}
        </div>
        <div className="rounded-xl bg-black/20 p-2">
          <div className="faint text-[0.7rem]">เป้าหมาย</div>
          <div className="up font-semibold">{it.target ? fmtMoney(it.target, cur) : "–"}</div>
          {it.target && <div className="faint text-[0.7rem]">{pct(it.target / it.price - 1)}</div>}
        </div>
      </div>

      <div className="mt-3">
        <p className="faint text-[0.75rem] font-medium">เหตุผล</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[0.9rem]">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      {it.reason.startsWith(DAY_TAG) && <p className="faint mt-2 text-[0.8rem]">ต้องขายภายในวันนี้ ไม่ว่าจะกำไรหรือขาดทุน</p>}
      <p className="faint mt-1 text-[0.8rem]">
        ไม้นี้: ขาดทุนสูงสุด ≈ <span className="down">{fmtMoney(risk)}</span> · กำไรถ้าถึงเป้า ≈ <span className="up">{fmtMoney(reward)}</span>
      </p>
    </li>
  );
}
