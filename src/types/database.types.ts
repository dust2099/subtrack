// Esta interfaz refleja la tabla 'profiles' en SQL
export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
  created_at: string;
}