'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

async function fetchBuildingFootprint(lat: number, lng: number) {
  try {
    const baseUrl = 'https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query';
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      distance: '10',
      units: 'esriSRUnit_Meter',
      outFields: '*',
      returnGeometry: 'true',
      f: 'geojson',
      inSR: '4326',
      outSR: '4326'
    });
    
    const res = await fetch(`${baseUrl}?${params.toString()}`);
    if (!res.ok) return null;
    
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      // Return the exact geometry
      return data.features[0].geometry;
    }
  } catch (err) {
    console.error('Failed to fetch building footprint:', err);
  }
  
  // Synthetic fallback (10x10m square) if MapServer fails or returns empty
  const d = 0.0001; 
  return {
    type: "Polygon",
    coordinates: [[
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d]
    ]]
  };
}

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'sysadmin' || profile?.role === 'm5_sysadmin';
}

export async function saveVenue(payload: any, venueId?: string) {
  if (!(await verifyAdmin())) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  console.log("saveVenue called with venueId:", venueId);
  console.log("payload:", payload);
  const adminSupabase = await createAdminClient();
  console.log("adminSupabase created");

  try {
      if (payload.location && typeof payload.location === 'string') {
        const match = payload.location.match(/POINT\(([^ ]+) ([^)]+)\)/);
        if (match) {
          const lng = parseFloat(match[1]);
          const lat = parseFloat(match[2]);
          payload.offerings = payload.offerings || {};
          payload.offerings.building_footprint = await fetchBuildingFootprint(lat, lng);
        }
      }

      if (venueId) {
        const { error } = await adminSupabase
          .from('venues')
          .update(payload)
          .eq('id', venueId);
        if (error) {
          console.error("Supabase update error:", error);
          throw error;
        }
        revalidatePath('/', 'layout');
        return { success: true };
      } else {
        if (!payload.id && payload.name) {
          payload.id = 'v-' + payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
        }
        const { data, error } = await adminSupabase
          .from('venues')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        revalidatePath('/', 'layout');
        return { success: true, data };
      }
    } catch (error: any) {
      console.error('Error saving venue:', error);
      return { success: false, error: error.message };
    }
}

export async function deleteVenue(venueId: string) {
  if (!(await verifyAdmin())) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const adminSupabase = await createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('venues')
      .delete()
      .eq('id', venueId);
    
    if (error) throw error;
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting venue:', error);
    return { success: false, error: error.message };
  }
}
