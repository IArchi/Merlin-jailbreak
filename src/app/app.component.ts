import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { EditorPanelComponent } from './components/editor-panel/editor-panel.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { PlaylistService } from './services/playlist.service';

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
}
