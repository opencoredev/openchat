import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import SyntaxHighlighter from "react-native-syntax-highlighter";
import { atomOneDark } from "react-native-syntax-highlighter/src/styles/hljs";

interface MarkdownMessageProps {
  content: string;
  /** 'user' messages render plain; 'assistant' messages get full markdown */
  role: "user" | "assistant";
}

const markdownStyles = StyleSheet.create({
  body: { color: "#fafafa", fontSize: 15, lineHeight: 22 },
  heading1: { color: "#fafafa", fontWeight: "800", fontSize: 22, marginTop: 12, marginBottom: 6 },
  heading2: { color: "#fafafa", fontWeight: "700", fontSize: 19, marginTop: 10, marginBottom: 4 },
  heading3: { color: "#fafafa", fontWeight: "700", fontSize: 17, marginTop: 8, marginBottom: 4 },
  paragraph: { color: "#fafafa", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { color: "#fafafa", fontSize: 15, lineHeight: 22 },
  code_inline: {
    color: "#38C9A8",
    backgroundColor: "#1c1c1f",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: "monospace",
    fontSize: 13,
  },
  fence: { marginVertical: 8 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#38C9A8",
    paddingLeft: 12,
    marginVertical: 8,
    opacity: 0.85,
  },
  strong: { fontWeight: "700", color: "#fafafa" },
  em: { fontStyle: "italic", color: "#d4d4d8" },
  link: { color: "#38C9A8", textDecorationLine: "underline" },
  hr: { backgroundColor: "#27272a", height: 1, marginVertical: 12 },
  table: { borderColor: "#27272a", borderWidth: 1, marginVertical: 8 },
  tr: { borderBottomColor: "#27272a", borderBottomWidth: 1 },
  th: { color: "#fafafa", fontWeight: "700", padding: 8, backgroundColor: "#18181b" },
  td: { color: "#d4d4d8", padding: 8 },
});

function CodeBlock({ language, value }: { language: string; value: string }) {
  return (
    <View style={codeStyles.container}>
      {language ? (
        <Text style={codeStyles.languageLabel}>{language}</Text>
      ) : null}
      <SyntaxHighlighter
        language={language || "text"}
        style={atomOneDark}
        fontSize={12}
        fontFamily="monospace"
        highlighter="hljs"
        customStyle={codeStyles.highlighter}
      >
        {value}
      </SyntaxHighlighter>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  container: {
    backgroundColor: "#111113",
    borderRadius: 8,
    overflow: "hidden",
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  languageLabel: {
    color: "#71717a",
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 6,
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  highlighter: {
    margin: 0,
    padding: 12,
    backgroundColor: "transparent",
  },
});

export function MarkdownMessage({ content, role }: MarkdownMessageProps) {
  // User messages: plain text
  if (role === "user") {
    return <Text style={plainStyles.text}>{content}</Text>;
  }

  const rules = useMemo(
    () => ({
      fence: (node: { content?: string; sourceInfo?: string }, _children: unknown, _parent: unknown, styles: Record<string, unknown>) => {
        const language = node.sourceInfo?.split(" ")[0] ?? "";
        const value = node.content ?? "";
        return <CodeBlock key={node.content} language={language} value={value} />;
      },
      code_inline: (node: { content?: string }, _children: unknown, _parent: unknown, styles: Record<string, unknown>) => (
        <Text key={node.content} style={markdownStyles.code_inline}>
          {node.content}
        </Text>
      ),
    }),
    []
  );

  return (
    <Markdown style={markdownStyles as Parameters<typeof Markdown>[0]["style"]} rules={rules as Parameters<typeof Markdown>[0]["rules"]}>
      {content}
    </Markdown>
  );
}

const plainStyles = StyleSheet.create({
  text: { color: "#fafafa", fontSize: 15, lineHeight: 22 },
});
