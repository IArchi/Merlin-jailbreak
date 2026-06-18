import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { EditorPanelComponent } from './components/editor-panel/editor-panel.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { OperationProgress } from './models/playlist-item.model';
import { PlaylistService } from './services/playlist.service';
import { FileService } from './services/file.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    SidebarComponent,
    EditorPanelComponent,
    WelcomeComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  protected playlistService = inject(PlaylistService);
  protected fileService = inject(FileService);

  constructor() {
    effect(() => {
      const inProgress = this.fileService.operationInProgress();
      const progress = this.fileService.progress();
      const label = this.fileService.progressLabel();

      console.info('[progress][app]', {
        inProgress,
        label,
        phase: progress?.phase ?? null,
        done_files: progress?.done_files ?? null,
        total_files: progress?.total_files ?? null,
        done_bytes: progress?.done_bytes ?? null,
        total_bytes: progress?.total_bytes ?? null,
        current_rel_path: progress?.current_rel_path ?? null
      });
    });

    void this.fileService.initializeWorkspaceRecovery();
    void this.fileService.installCloseHandler();
  }

  ngOnDestroy(): void {
    this.fileService.dispose();
  }

  get operationProgress(): OperationProgress {
    return this.fileService.getOperationProgress(value => this.formatBytes(value));
  }

  formatBytes(value: number): string {
    if (value <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const precision = unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  }
}
