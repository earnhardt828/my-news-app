"use client";

import Link from "next/link";
import type { MouseEventHandler, ReactNode, TouchEventHandler } from "react";
import CommentIcon from "./comment-icon";
import HeartIcon from "./heart-icon";

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
            <HeartIcon className="feed-meta-inline-icon" size={18} strokeWidth={1.9} />
            <span>{likes}</span>
          </span>
          <span className="feed-meta-inline-group">
            <CommentIcon className="feed-meta-inline-icon" size={18} strokeWidth={1.9} />
            <span>{commentsCount}</span>
          </span>
        </span>
      </div>
    </article>
  );
}
