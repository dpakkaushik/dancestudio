/** A studio's room. One studio = one location, so a room belongs to exactly one
 *  tenant, and its capacity caps every class held in it. */
export interface Room {
  id: string;
  tenantId: string;
  name: string;
  capacity: number;
  amenities: string[];
}
