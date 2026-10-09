import { cn } from "@/lib/utils";
import s from "./illustrations.module.css";

/**
 * Small animated pictures that show what a feature does at a glance, drawn in
 * the dashboard's monochrome palette (colour only where it carries meaning).
 * Decorative: each sits next to text that says the same thing.
 */

function Frame({ caption, className, width = 240, children }: { caption?: string; className?: string; width?: number; children: React.ReactNode }) {
  return (
    <figure className={cn("flex shrink-0 flex-col items-center gap-2 rounded-field border border-line bg-white/[0.02] px-4 py-3", className)}>
      <svg viewBox={`0 0 ${width} 120`} className={cn(s.svg, "h-auto w-full")} style={{ maxWidth: width * 1.25 }} aria-hidden focusable="false">
        {children}
      </svg>
      {caption && <figcaption className="text-center text-2xs text-mist">{caption}</figcaption>}
    </figure>
  );
}

/** A tiny browser window: frame, address bar dots and a couple of content lines. */
function Browser({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" className="fill-white/[0.04] stroke-white/20" />
      <line x1={x} y1={y + 14} x2={x + w} y2={y + 14} className="stroke-white/10" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + 9 + i * 7} cy={y + 7} r="2" className="fill-white/25" />
      ))}
      <rect x={x + 10} y={y + 24} width={w * 0.45} height="5" rx="2.5" className="fill-white/20" />
      <rect x={x + 10} y={y + 34} width={w * 0.7} height="4" rx="2" className="fill-white/10" />
      <rect x={x + 10} y={y + 42} width={w * 0.6} height="4" rx="2" className="fill-white/10" />
    </g>
  );
}

/** One line of code goes in; the banner appears on the website. */
export function InstallIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} caption="One line, then everything works">
      <rect x="8" y="44" width="72" height="30" rx="8" className="fill-white/[0.06] stroke-white/20" />
      <text x="16" y="63" className="fill-fog font-mono" fontSize="9">{"<script>"}</text>
      <path d="M86 59 H116" className={cn("stroke-white/40", s.flow)} strokeWidth="1.5" fill="none" />
      <path d="M112 55 l5 4 -5 4" className="stroke-white/40" strokeWidth="1.5" fill="none" />
      <Browser x={124} y={16} w={108} h={88} />
      <g className={s.bannerUp}>
        <rect x="130" y="76" width="96" height="22" rx="6" className="fill-paper" />
        <rect x="136" y="82" width="34" height="4" rx="2" className="fill-black/40" />
        <rect x="136" y="89" width="24" height="3" rx="1.5" className="fill-black/20" />
        <rect x="190" y="82" width="30" height="10" rx="5" className="fill-black" />
      </g>
    </Frame>
  );
}

/** The banner picks up the website's brand colour. */
export function BrandColorsIllustration({ color = "#0f766e", className }: { color?: string; className?: string }) {
  return (
    <Frame className={className} caption="Your colours, on your banner">
      <Browser x={8} y={10} w={112} h={84} />
      <rect x="18" y="64" width="40" height="14" rx="7" fill={color} />
      <circle cx="38" cy="71" r="5" fill={color} className={s.drop} />
      <rect x="120" y="70" width="112" height="40" rx="8" className="fill-paper" />
      <rect x="128" y="78" width="46" height="5" rx="2.5" className="fill-black/40" />
      <rect x="128" y="88" width="34" height="4" rx="2" className="fill-black/20" />
      <rect x="182" y="96" width="42" height="8" rx="4" className="fill-black/15" />
      <rect x="182" y="78" width="42" height="14" rx="7" className="fill-black/25" />
      <rect x="182" y="78" width="42" height="14" rx="7" fill={color} className={s.fillIn} />
    </Frame>
  );
}

/** The badge appears in the website's footer, or floating in a corner. */
export function BadgeIllustration({ placement, className }: { placement: "footer" | "corner"; className?: string }) {
  return (
    <Frame className={className} caption={placement === "footer" ? "Shown in your website's footer" : "Floats in a corner of the page"}>
      <rect x="40" y="6" width="160" height="108" rx="8" className="fill-white/[0.04] stroke-white/20" />
      <line x1="40" y1="20" x2="200" y2="20" className="stroke-white/10" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={49 + i * 7} cy="13" r="2" className="fill-white/25" />
      ))}
      <rect x="52" y="30" width="70" height="6" rx="3" className="fill-white/20" />
      <rect x="52" y="42" width="120" height="4" rx="2" className="fill-white/10" />
      <rect x="52" y="50" width="104" height="4" rx="2" className="fill-white/10" />
      <rect x="40.5" y="84" width="159" height="29.5" rx="0" className="fill-white/[0.05]" />
      <line x1="40" y1="84" x2="200" y2="84" className="stroke-white/10" />
      {placement === "corner" && <circle cx="186" cy="70" r="6" className="fill-white/10 stroke-white/30" />}
      <g className={s.pop}>
        {placement === "footer" ? (
          <BadgePill x={92} y={91} />
        ) : (
          <BadgePill x={48} y={62} />
        )}
      </g>
    </Frame>
  );
}

function BadgePill({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="56" height="16" rx="8" className="fill-paper" />
      <path d={`M${x + 9} ${y + 4} l4 -1.5 4 1.5 v3 c0 2.5 -1.8 4.2 -4 4.8 -2.2 -0.6 -4 -2.3 -4 -4.8z`} className="fill-black/70" />
      <rect x={x + 21} y={y + 5} width="27" height="3" rx="1.5" className="fill-black/50" />
      <rect x={x + 21} y={y + 10} width="18" height="2" rx="1" className="fill-black/25" />
    </g>
  );
}

/** A tick box is added to the form; the person's choice is saved. */
export function FormsIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} caption="Tick box added, choice saved">
      <rect x="20" y="8" width="120" height="104" rx="10" className="fill-white/[0.04] stroke-white/20" />
      <rect x="32" y="20" width="36" height="4" rx="2" className="fill-white/25" />
      <rect x="32" y="28" width="96" height="12" rx="4" className="fill-white/[0.06] stroke-white/15" />
      <rect x="32" y="46" width="36" height="4" rx="2" className="fill-white/25" />
      <rect x="32" y="54" width="96" height="12" rx="4" className="fill-white/[0.06] stroke-white/15" />
      <rect x="32" y="74" width="10" height="10" rx="2.5" className="fill-transparent stroke-white/60" />
      <path d="M34.5 79 l2.5 2.5 4.5 -5" className={cn("stroke-paper", s.tick)} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="48" y="77" width="64" height="4" rx="2" className="fill-white/20" />
      <g className={s.press}>
        <rect x="32" y="92" width="44" height="12" rx="6" className="fill-paper" />
        <rect x="42" y="96.5" width="24" height="3" rx="1.5" className="fill-black/50" />
      </g>
      <g className={s.saved}>
        <rect x="152" y="46" width="78" height="28" rx="8" className="fill-success/10 stroke-success/50" />
        <circle cx="166" cy="60" r="6" className="fill-success" />
        <path d="M163 60 l2 2 4 -4" className="stroke-black" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="178" y="56" width="42" height="3.5" rx="1.75" className="fill-success/70" />
        <rect x="178" y="62" width="28" height="3" rx="1.5" className="fill-success/40" />
      </g>
    </Frame>
  );
}

/** Google and Meta tags wait until the visitor agrees. */
export function AdsConsentIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} caption="Ads wait until people agree">
      <rect x="8" y="30" width="104" height="60" rx="10" className="fill-paper" />
      <rect x="18" y="40" width="54" height="5" rx="2.5" className="fill-black/40" />
      <rect x="18" y="50" width="76" height="4" rx="2" className="fill-black/20" />
      <rect x="18" y="66" width="38" height="14" rx="7" className="fill-transparent stroke-black/25" />
      <rect x="62" y="66" width="40" height="14" rx="7" className="fill-black" />
      <text x="70" y="76" className="fill-paper" fontSize="7.5" fontWeight="600">Accept</text>
      <path d="M86 74 l0 11 3 -3 2.5 5 2 -1 -2.5 -5 4 0z" className={cn("fill-paper stroke-black", s.cursor)} strokeWidth="1" />
      <path d="M120 60 H144" className={cn("stroke-white/40", s.flow)} strokeWidth="1.5" fill="none" />
      <rect x="150" y="34" width="82" height="52" rx="10" className="fill-white/[0.04] stroke-white/20" />
      <text x="162" y="52" className="fill-fog" fontSize="8.5" fontWeight="600">Google · Meta</text>
      <g className={s.waiting}>
        <circle cx="166" cy="68" r="7" className="fill-warning/15 stroke-warning/70" />
        <rect x="163.5" y="64.5" width="1.8" height="7" rx="0.9" className="fill-warning" />
        <rect x="166.7" y="64.5" width="1.8" height="7" rx="0.9" className="fill-warning" />
        <text x="179" y="71" className="fill-warning" fontSize="8">Waiting</text>
      </g>
      <g className={s.going}>
        <circle cx="166" cy="68" r="7" className="fill-success/15 stroke-success/70" />
        <path d="M163.8 64.5 l5 3.5 -5 3.5z" className="fill-success" />
        <text x="179" y="71" className="fill-success" fontSize="8">Allowed</text>
      </g>
    </Frame>
  );
}

/** Each week HighPre checks the website again and says what changed. */
export function MonitoringIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} caption="Checked every week, alert if anything changes">
      <rect x="20" y="22" width="150" height="76" rx="10" className="fill-white/[0.04] stroke-white/20" />
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <g key={i} className={s.day} style={{ "--i": i } as React.CSSProperties}>
          <text x={34 + i * 19} y="42" className="fill-mist" fontSize="7.5" textAnchor="middle">{d}</text>
          <circle cx={34 + i * 19} cy="56" r="5" className={i === 6 ? "fill-paper" : "fill-white/20"} />
        </g>
      ))}
      <clipPath id="hp-monitor-clip">
        <rect x="26" y="68" width="138" height="20" rx="4" />
      </clipPath>
      <rect x="26" y="68" width="138" height="20" rx="4" className="fill-white/[0.05]" />
      <g clipPath="url(#hp-monitor-clip)">
        <rect x="75" y="68" width="40" height="20" className={cn("fill-white/15", s.sweep)} />
      </g>
      <text x="95" y="81" className="fill-fog" fontSize="8" textAnchor="middle">Checking your website</text>
      <g className={s.bell}>
        <path d="M196 44 a12 12 0 0 1 12 12 v10 l4 5 h-32 l4 -5 v-10 a12 12 0 0 1 12 -12z" className="fill-white/10 stroke-white/50" strokeWidth="1.4" />
        <path d="M191 75 a5 5 0 0 0 10 0" className="stroke-white/50" strokeWidth="1.4" fill="none" />
        <circle cx="206" cy="46" r="5" className="fill-warning" />
      </g>
    </Frame>
  );
}

/**
 * Desktop agent, end to end: sensitive text is copied while an AI app is open,
 * the person is warned on screen, and the owner gets only the kind of data and
 * the app. The text itself stays on the computer.
 */
export function AgentHowItWorksIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} width={360} caption="The person is warned. The owner sees what kind of data, never the data itself.">
      {/* Laptop with an AI chat open and a card number on the clipboard. */}
      <rect x="10" y="10" width="150" height="92" rx="8" className="fill-white/[0.04] stroke-white/20" />
      <path d="M2 106 h166 l-6 8 h-154z" className="fill-white/10" />
      <text x="20" y="25" className="fill-fog" fontSize="8" fontWeight="600">ChatGPT</text>
      <rect x="20" y="32" width="80" height="5" rx="2.5" className="fill-white/15" />
      <rect x="20" y="41" width="60" height="5" rx="2.5" className="fill-white/10" />
      <rect x="20" y="78" width="130" height="16" rx="8" className="fill-white/[0.06] stroke-white/15" />
      <rect x="26" y="52" width="74" height="16" rx="4" className="fill-white/10 stroke-white/25" strokeDasharray="2 2" />
      <text x="31" y="63" className="fill-fog font-mono" fontSize="7.5">4111 ••••</text>
      <g className={s.pop}>
        <rect x="78" y="46" width="76" height="26" rx="6" className="fill-paper" />
        <circle cx="88" cy="59" r="5" className="fill-warning" />
        <rect x="87.2" y="55.5" width="1.6" height="4.2" rx="0.8" className="fill-black" />
        <circle cx="88" cy="61.6" r="0.9" className="fill-black" />
        <text x="97" y="57" className="fill-black" fontSize="6.5" fontWeight="700">Careful</text>
        <text x="97" y="65" className="fill-black/60" fontSize="6">card number</text>
      </g>
      {/* Lock: the text stays here. */}
      <g transform="translate(132 18)">
        <rect x="0" y="5" width="14" height="10" rx="2" className="fill-white/15 stroke-white/40" />
        <path d="M3 5 v-2 a4 4 0 0 1 8 0 v2" className="stroke-white/40" strokeWidth="1.3" fill="none" />
      </g>
      {/* Only a small label travels to the owner. */}
      <path d="M172 58 H246" className={cn("stroke-white/30", s.flow)} strokeWidth="1.5" fill="none" />
      <g className={s.travel}>
        <rect x="170" y="48" width="72" height="20" rx="10" className="fill-raised stroke-white/30" />
        <text x="206" y="61" className="fill-fog" fontSize="7" textAnchor="middle">Card · ChatGPT</text>
      </g>
      {/* Owner. */}
      <rect x="258" y="22" width="94" height="76" rx="10" className="fill-white/[0.04] stroke-white/20" />
      <circle cx="305" cy="44" r="9" className="fill-white/15" />
      <path d="M289 72 a16 12 0 0 1 32 0z" className="fill-white/15" />
      <text x="305" y="88" className="fill-mist" fontSize="7.5" textAnchor="middle">Owner</text>
      <g className={s.bell}>
        <circle cx="336" cy="32" r="7" className="fill-danger" />
        <text x="336" y="35" className="fill-black" fontSize="8" fontWeight="700" textAnchor="middle">1</text>
      </g>
    </Frame>
  );
}

/** The browser extension asks before sensitive text is pasted into an AI or chat site. */
export function ExtensionIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} caption="Asks before it's pasted">
      <rect x="20" y="8" width="200" height="104" rx="8" className="fill-white/[0.04] stroke-white/20" />
      <line x1="20" y1="22" x2="220" y2="22" className="stroke-white/10" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={29 + i * 7} cy="15" r="2" className="fill-white/25" />
      ))}
      <rect x="32" y="30" width="90" height="5" rx="2.5" className="fill-white/15" />
      <rect x="32" y="88" width="176" height="16" rx="8" className="fill-white/[0.06] stroke-white/15" />
      <g className={s.pop}>
        <rect x="58" y="34" width="124" height="48" rx="8" className="fill-paper" />
        <text x="68" y="48" className="fill-black" fontSize="7.5" fontWeight="700">Looks like a password</text>
        <rect x="68" y="53" width="80" height="3.5" rx="1.75" className="fill-black/25" />
        <rect x="68" y="63" width="52" height="12" rx="6" className="fill-black" />
        <text x="94" y="71.5" className="fill-paper" fontSize="6.5" textAnchor="middle" fontWeight="600">Don&apos;t paste</text>
        <rect x="124" y="63" width="50" height="12" rx="6" className="fill-transparent stroke-black/25" />
        <text x="149" y="71.5" className="fill-black/70" fontSize="6.5" textAnchor="middle">Paste anyway</text>
      </g>
    </Frame>
  );
}

/** One company installer sets up every computer. */
export function CompanyInstallIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className} caption="One installer for every computer">
      <rect x="10" y="40" width="56" height="40" rx="8" className="fill-paper" />
      <path d="M38 50 v14 m-6 -6 l6 6 6 -6" className="stroke-black" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="28" y="68" width="20" height="3" rx="1.5" className="fill-black/40" />
      {[24, 60, 96].map((y, i) => (
        <g key={y}>
          <path d={`M70 60 C 100 60, 110 ${y}, 136 ${y}`} className={cn("stroke-white/30", s.flow)} strokeWidth="1.3" fill="none" />
          <rect x="140" y={y - 13} width="44" height="26" rx="4" className="fill-white/[0.04] stroke-white/25" />
          <path d={`M136 ${y + 15} h52 l-3 4 h-46z`} className="fill-white/10" />
          <g className={s.day} style={{ "--i": i * 2 } as React.CSSProperties}>
            <circle cx="200" cy={y} r="7" className="fill-success/15 stroke-success/70" />
            <path d={`M197 ${y} l2 2 4 -4`} className="stroke-success" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      ))}
    </Frame>
  );
}
