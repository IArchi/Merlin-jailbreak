import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlaylistService } from '../../services/playlist.service';
import { TreeNodeComponent } from '../tree-node/tree-node.component';
import { PlaylistItem } from '../../models/playlist-item.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, TreeNodeComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  protected playlistService = inject(PlaylistService);

  searchQuery = '';

  onItemSelected(item: PlaylistItem): void {
    // Item selection is handled by the tree node component
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
    // TODO: Implement search filtering
  }

  onCreateFolder(): void {
    const hierarchy = this.playlistService.hierarchy();
    
    if (!hierarchy) return;

    this.playlistService.createFolder(hierarchy.id, 'NouveauDossier');
  }

  onCreateSubfolder(item: PlaylistItem): void {
    this.playlistService.createFolder(item.id, 'NouveauDossier');
  }
}
