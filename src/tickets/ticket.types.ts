export type TicketStatus = 'open' | 'in_progress' | 'pending' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateTicketInput {
  title: string;
  description: string;
  priority?: TicketPriority;
  assignedTo?: string;
  project?: string;
  dueDate?: number;   // unix timestamp
  createdBy: string;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  description?: string;
  project?: string;
  dueDate?: number;   // unix timestamp
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  project?: string;
  overdue?: boolean;  // only tickets past their due_date
  limit?: number;
}
