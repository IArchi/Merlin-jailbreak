import { Component, Input, inject, signal, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.css'
})
export class AudioPlayerComponent implements OnChanges, OnDestroy {
  @Input() soundpath: string = '';
  @Input() compact = false;
  
  protected fileService = inject(FileService);
  
  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private loadRequestId = 0;
  
  isPlaying = signal(false);
  isLoading = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  error = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['soundpath']) {
      return;
    }

    this.cleanup();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.loadRequestId += 1;

    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.duration.set(0);
    this.error.set(null);
  }

  async togglePlay(): Promise<void> {
    if (!this.soundpath) return;

    if (this.isPlaying()) {
      this.audio?.pause();
      this.isPlaying.set(false);
      return;
    }

    if (!this.audio) {
      await this.loadAudio(true);
    }

    if (this.audio && !this.error()) {
      try {
        await this.audio.play();
        this.isPlaying.set(true);
      } catch (e) {
        this.error.set('Erreur de lecture');
        console.error('Error playing audio:', e);
      }
    }
  }

  private async loadAudio(showLoading: boolean): Promise<void> {
    const requestId = this.loadRequestId;

    if (showLoading) {
      this.isLoading.set(true);
    }

    this.error.set(null);

    try {
      const url = await this.fileService.readAsset(this.soundpath);

      if (requestId !== this.loadRequestId) {
        if (url) {
          URL.revokeObjectURL(url);
        }
        return;
      }

      if (!url) {
        this.error.set('Fichier audio introuvable');
        return;
      }

      this.audioUrl = url;
      this.audio = new Audio(url);
      this.audio.preload = 'metadata';

      this.audio.addEventListener('timeupdate', () => {
        this.currentTime.set(this.audio?.currentTime ?? 0);
      });

      this.audio.addEventListener('loadedmetadata', () => {
        this.duration.set(this.audio?.duration ?? 0);
      });

      this.audio.addEventListener('ended', () => {
        this.isPlaying.set(false);
        this.currentTime.set(0);
      });

      this.audio.addEventListener('error', () => {
        this.error.set('Erreur de chargement');
        this.isPlaying.set(false);
      });

      if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        this.duration.set(this.audio.duration || 0);
      }
    } catch (e) {
      this.error.set('Erreur de chargement');
      console.error('Error loading audio:', e);
    } finally {
      if (showLoading && requestId === this.loadRequestId) {
        this.isLoading.set(false);
      }
    }
  }

  seek(event: MouseEvent): void {
    if (!this.audio || !this.duration()) return;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const time = percent * this.duration();
    
    this.audio.currentTime = time;
    this.currentTime.set(time);
  }

  formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  get progressPercent(): number {
    if (!this.duration()) return 0;
    return (this.currentTime() / this.duration()) * 100;
  }
}
