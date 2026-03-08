export interface Station {
  id: string;
  name: string;
  youtubeId: string;
}

export const STATIONS: Station[] = [
  { id: "lofi", name: "lofi hip hop", youtubeId: "jfKfPfyJRdk" },
  { id: "synthwave", name: "synthwave", youtubeId: "4xDzrJKXOOY" },
  { id: "jazz", name: "jazz", youtubeId: "Dx5qFachd3A" },
  { id: "chillhop", name: "chillhop", youtubeId: "5yx6BWlEVcY" },
  { id: "classical", name: "classical", youtubeId: "jgpJVI3tDbY" },
  { id: "ambient", name: "ambient", youtubeId: "S_MOd40zlYU" },
  { id: "coffeshop", name: "coffee shop", youtubeId: "h2zkV-l_TbY" },
  { id: "deephouse", name: "deep house", youtubeId: "WsDyRAPFBC8" },
  { id: "techno", name: "techno", youtubeId: "UYOb37KRFqk" },
];

interface AudioState {
  station: Station | null;
  playing: boolean;
}

class OfficeAudio {
  private iframe: HTMLIFrameElement | null = null;
  private currentStation: Station | null = null;
  private playing = false;
  private listeners: Array<() => void> = [];
  private snapshot: AudioState = { station: null, playing: false };

  private notify() {
    this.snapshot = { station: this.currentStation, playing: this.playing };
    this.listeners.forEach((fn) => fn());
  }

  private getOrCreateIframe(): HTMLIFrameElement {
    if (this.iframe) {
      return this.iframe;
    }

    this.iframe = document.createElement("iframe");
    this.iframe.style.display = "none";
    this.iframe.allow = "autoplay";
    document.body.appendChild(this.iframe);

    return this.iframe;
  }

  play(station?: Station) {
    const target = station ?? this.currentStation ?? STATIONS[0]!;
    const el = this.getOrCreateIframe();

    el.src = `https://www.youtube.com/embed/${target.youtubeId}?autoplay=1&loop=1`;
    this.currentStation = target;
    this.playing = true;
    this.notify();
  }

  stop() {
    if (this.iframe) {
      this.iframe.src = "";
    }

    this.playing = false;
    this.notify();
  }

  toggle() {
    if (this.playing) {
      this.stop();
    } else {
      this.play();
    }
  }

  nextStation() {
    if (!this.currentStation) {
      this.play(STATIONS[0]!);

      return;
    }

    const idx = STATIONS.findIndex((s) => s.id === this.currentStation!.id);
    const next = STATIONS[(idx + 1) % STATIONS.length]!;

    this.play(next);
  }

  getState() {
    return this.snapshot;
  }

  /** Click: play if stopped, next station if playing */
  playOrNext() {
    if (!this.playing) {
      this.play();
    } else {
      this.nextStation();
    }
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

export const officeAudio = new OfficeAudio();
