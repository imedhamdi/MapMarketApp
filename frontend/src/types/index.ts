export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Ad {
  id: string;
  title: string;
  description: string;
  price?: number;
  imageUrls?: string[];
  location?: {
    address?: string;
    coordinates: [number, number];
  };
}
