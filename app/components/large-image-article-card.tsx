"use client";

import Link from "next/link";
import type { MouseEventHandler, ReactNode, TouchEventHandler } from "react";

type LargeImageArticleCardProps = {
  href: string;
  sourceContent: ReactNode;
  publishedLabel: string;
  title: string;
  summary?: string | null;
  imageSrc: string;
  imageAlt: string;
  likes: number;
  commentsCount: number;
  topRightContent?: ReactNode;
  className?: string;
  onOpen?: MouseEventHandler<HTMLAnchorElement>;
  onImageError?: () => void;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  onTouchStart?: TouchEventHandler<HTMLElement>;
  onTouchEnd?: TouchEventHandler<HTMLElement>;
  onTouchCancel?: TouchEventHandler<HTMLElement>;
  onTouchMove?: TouchEventHandler<HTMLElement>;
};

export default function LargeImageArticleCard({
  href,
  sourceContent,
  publishedLabel,
  title,
  summary,
  imageSrc,
  imageAlt,
  likes,
  commentsCount,
  topRightContent,
  className = "",
  onOpen,
  onImageError,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
  onTouchMove,
}: LargeImageArticleCardProps) {
  return (
    <article
      className={`news-card large-image-article-card ${className}`.trim()}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onTouchMove={onTouchMove}
    >
      <div className="large-image-article-card-top">
        <div className="large-image-article-card-source">
          {sourceContent}
        </div>
        <div className="large-image-article-card-top-meta">
          {topRightContent}
          <span className="large-image-article-card-time">{publishedLabel}</span>
        </div>
      </div>
      <Link href={href} className="article-link large-image-article-card-link" onClick={onOpen}>
        <div className="large-image-article-card-copy">
          <h3 className="trending-article-title large-image-article-card-title">{title}</h3>
          {summary ? <p className="large-image-article-card-summary">{summary}</p> : null}
        </div>
        <div className="large-image-article-card-media" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={imageAlt}
            className="large-image-article-card-image"
            loading="lazy"
            decoding="async"
            onError={onImageError}
          />
        </div>
      </Link>
      <div className="news-card-footer large-image-article-card-footer">
        <span className="trending-published-date news-card-footer-date feed-meta-inline">
          <span>{publishedLabel}</span>
          <span className="feed-meta-inline-group">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="feed-meta-inline-icon"
              focusable="false"
              aria-hidden="true"
            >
              <path d="m12 20.2-1.1-1C5.2 14 2 11.1 2 7.6 2 4.8 4.2 2.8 7 2.8c1.6 0 3.2.8 4.2 2.1 1-1.3 2.6-2.1 4.2-2.1 2.8 0 5 2 5 4.8 0 3.5-3.2 6.4-8.9 11.6L12 20.2Z" />
            </svg>
            <span>{likes}</span>
          </span>
          <span className="feed-meta-inline-group">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="feed-meta-inline-icon"
              focusable="false"
              aria-hidden="true"
            >
              <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.4 4v-4H6.8A2.8 2.8 0 0 1 4 13.2Z" />
            </svg>
            <span>{commentsCount}</span>
          </span>
        </span>
      </div>
    </article>
  );
}
