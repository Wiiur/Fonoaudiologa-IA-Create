import React from "react";

// Minimal markdown-to-HTML renderer for clinical content
// Supports: # ## ### headers, **bold**, *italic*, - lists, 1. ordered, --- hr, paragraphs
export default function MarkdownView({ content = "" }) {
  const html = renderMarkdown(content);
  return <div className="prose-clinical" dangerouslySetInnerHTML={{ __html: html }} />;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  let out = esc(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let list = null; // 'ul' | 'ol' | null
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push("<p>" + inline(para.join(" ")) + "</p>");
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      flushPara();
      closeList();
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s/, "");
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line)) {
      flushPara();
      closeList();
      out.push("<hr/>");
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push("<li>" + inline(line.replace(/^\s*\d+\.\s+/, "")) + "</li>");
      continue;
    }
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}
