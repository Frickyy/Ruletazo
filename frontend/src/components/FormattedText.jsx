import { useState } from "react";
import "./FormattedText.css";

/**
 * Texto del foro con un formato mínimo y seguro (se arma con elementos de React, nunca con HTML):
 *   **negrita**   ||spoiler||   links que empiezan con http:// o https://
 * Los saltos de línea se respetan.
 */
const TOKEN_RE = /(\*\*[^*\n]+?\*\*|\|\|[^|\n]+?\|\||https?:\/\/[^\s<>"]+)/g;

export const FORMAT_HELP = "**negrita** · ||spoiler|| · los links se activan solos";

function FormattedText({ text, className = "", as: Tag = "p" }) {
  return (
    <Tag className={`formatted ${className}`.trim()}>
      {(text ?? "").split("\n").map((line, index, lines) => (
        <span key={index}>
          {renderInline(line)}
          {index < lines.length - 1 && <br />}
        </span>
      ))}
    </Tag>
  );
}

/** Parte una línea en piezas: texto, negrita, spoiler o link. Sin React, para poder testearlo. */
export function tokenize(line) {
  const tokens = [];
  for (const part of line.split(TOKEN_RE)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) tokens.push({ type: "bold", text: part.slice(2, -2) });
    else if (part.startsWith("||") && part.endsWith("||") && part.length > 4) tokens.push({ type: "spoiler", text: part.slice(2, -2) });
    else if (/^https?:\/\//.test(part)) {
      // Un punto o una coma al final suelen ser de la oración, no del link.
      const [, url, trailing] = part.match(/^(.*?)([.,;:!?)]*)$/);
      tokens.push({ type: "link", text: url });
      if (trailing) tokens.push({ type: "text", text: trailing });
    } else tokens.push({ type: "text", text: part });
  }
  return tokens;
}

function renderInline(line) {
  return tokenize(line).map((token, index) => {
    if (token.type === "bold") return <strong key={index}>{token.text}</strong>;
    if (token.type === "spoiler") return <Spoiler key={index} text={token.text} />;
    if (token.type === "link") {
      return (
        <a key={index} href={token.text} target="_blank" rel="noopener noreferrer nofollow ugc">
          {token.text}
        </a>
      );
    }
    return <span key={index}>{token.text}</span>;
  });
}

function Spoiler({ text }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      className={`spoiler${revealed ? " spoiler--revealed" : ""}`}
      onClick={() => setRevealed(true)}
      aria-label={revealed ? undefined : "Spoiler oculto, tocá para verlo"}
      aria-expanded={revealed}
    >
      <span aria-hidden={!revealed}>{text}</span>
    </button>
  );
}

export default FormattedText;
