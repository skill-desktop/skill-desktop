import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

interface MarkdownProps {
  content: string;
  className?: string;
}

const MarkdownImage = ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(src);

  useEffect(() => {
    const resolveSrc = async () => {
      if (!src) return;
      // If it's an external URL, leave it as is
      if (src.startsWith("http://") || src.startsWith("https://")) {
        return;
      }

      try {
        const baseDir = await appDataDir();
        // The user mentioned paths like "img/{{page_name}}/{{uuid}}.jpg"
        // We assume these are relative to the appDataDir
        const absolutePath = await join(baseDir, src);
        const assetUrl = convertFileSrc(absolutePath);
        setResolvedSrc(assetUrl);
      } catch (error) {
        console.error("Failed to resolve image path:", error);
      }
    };

    resolveSrc();
  }, [src]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      {...props}
      className={cn("rounded-lg border border-border-default bg-bg-tertiary", props.className)}
    />
  );
};

export const Markdown: React.FC<MarkdownProps> = ({ content, className }) => {
  return (
    <div className={cn(
      "prose prose-invert max-w-none prose-sm prose-p:leading-relaxed prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border-default",
      className
    )}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        remarkPlugins={[remarkGfm]}
        components={{
          img: MarkdownImage,
          a: ({ className: aClassName, ...props }) => (
            <a
              className={cn("text-accent-blue no-underline hover:underline", aClassName)}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          code: ({ className: codeClassName, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(codeClassName || "");
            return match ? (
              <code className={cn("bg-bg-tertiary px-1.5 py-0.5 rounded text-xs", codeClassName)} {...props}>
                {children}
              </code>
            ) : (
              <code className={cn("bg-bg-tertiary px-1.5 py-0.5 rounded text-xs", codeClassName)} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
