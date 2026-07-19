import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-portfolio-cards',
  imports: [CommonModule],
  templateUrl: './portfolio-cards.component.html',
  styleUrl: './portfolio-cards.component.scss',
})
export class PortfolioCardsComponent {
  protected readonly dataService = inject(DataService);
}
