export type UiCitation = {
  domain: string;
  url: string;
  faviconUrl: string;
  title?: string;
};

export type UiItem = {
  id: string;
  kind: "thought" | "search";
  title: string;
  body?: string;
  citations?: UiCitation[];
  moreCount?: number;
};

