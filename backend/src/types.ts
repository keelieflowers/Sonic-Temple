export type ArtistMatch = {
  mbid: string;
  name: string;
  sortName?: string;
  disambiguation?: string;
  url?: string;
};

export type SongSection = {
  name: string;
  songs: string[];
};

export type LatestSetlist = {
  id: string;
  eventDate?: string;
  lastUpdated?: string;
  artistName?: string;
  tourName?: string;
  venueName?: string;
  cityName?: string;
  state?: string;
  countryCode?: string;
  countryName?: string;
  sections: SongSection[];
  songCount: number;
};

export type ArtistShowResult = {
  inputBandName: string;
  artistMatch: ArtistMatch | null;
  latestSetlist: LatestSetlist | null;
  status: "ok" | "no_artist_match" | "no_setlist_found" | "api_error";
  error?: string;
};
