import type { NoticeLanguageContent } from "@/lib/notice/generate";
import { cn } from "@/lib/utils";

/** Turns bare URLs in notice text into links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="break-all text-paper underline decoration-white/30 underline-offset-4 hover:decoration-white">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/** Renders a generated notice. Lines starting with "•" become list items. */
export function NoticeDocument({ content, lang, className }: { content: NoticeLanguageContent; lang: string; className?: string }) {
  return (
    <article lang={lang} className={cn("text-pretty", className)}>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{content.title}</h1>
      <p className="mt-4 text-sm leading-relaxed text-fog/90">{content.intro}</p>
      <div className="mt-10 space-y-9">
        {content.sections.map((section) => {
          const lines = section.body.split("\n").filter(Boolean);
          const bullets = lines.filter((l) => l.startsWith("• "));
          const text = lines.filter((l) => !l.startsWith("• "));
          return (
            <section key={section.heading}>
              <h2 className="text-base font-medium">{section.heading}</h2>
              {bullets.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {bullets.map((b) => (
                    <li key={b} className="border-l-2 border-white/20 pl-4 text-sm leading-relaxed text-fog/90">
                      {b.slice(2)}
                    </li>
                  ))}
                </ul>
              )}
              {text.map((t) => (
                <p key={t} className="mt-2 break-words text-sm leading-relaxed text-fog/90">
                  {linkify(t)}
                </p>
              ))}
            </section>
          );
        })}
      </div>
    </article>
  );
}
