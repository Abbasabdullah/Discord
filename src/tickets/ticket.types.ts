export type TicketStatus = 'open' | 'in_progress' | 'pending' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateTicketInput {
  title: string;
  description: string;
  priority?: TicketPriority;
  assignedTo?: string;
  project?: string;
  createdBy: string;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  description?: string;
  project?: string;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  project?: string;
  limit?: number;
}
