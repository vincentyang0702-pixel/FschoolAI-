/**
 * Event Stream Service
 * 
 * Real-time monitoring of all student activities across all platforms
 * - Canvas assignments, grades, submissions
 * - Device activity (app usage, focus time, biometrics)
 * - Cross-platform data (GitHub, Slack, Discord, Google Drive)
 * - Captures everything in real-time for the Brain to analyze
 */

import { createClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';

export interface Event {
  event_id: string;
  user_id: string;
  event_type: string;
  source: 'canvas' | 'device' | 'github' | 'slack' | 'discord' | 'google_drive' | 'notion';
  timestamp: Date;
  data: Record<string, any>;
  processed: boolean;
  created_at: Date;
}

export interface EventPattern {
  pattern_id: string;
  user_id: string;
  pattern_type: string;
  events: Event[];
  confidence: number;
  first_seen: Date;
  last_seen: Date;
  frequency: number;
}

export class EventStreamService extends EventEmitter {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  private eventBuffer: Event[] = [];
  private bufferSize = 100;
  private flushInterval = 5000; // 5 seconds

  constructor() {
    super();
    this.startEventBuffer();
  }

  /**
   * Capture event from any source
   */
  async captureEvent(
    userId: string,
    eventType: string,
    source: Event['source'],
    data: Record<string, any>
  ): Promise<Event> {
    const event: Event = {
      event_id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: userId,
      event_type: eventType,
      source,
      timestamp: new Date(),
      data,
      processed: false,
      created_at: new Date(),
    };

    // Add to buffer
    this.eventBuffer.push(event);

    // Emit event for real-time listeners
    this.emit('event', event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.bufferSize) {
      await this.flushEventBuffer();
    }

    return event;
  }

  /**
   * Capture Canvas events
   */
  async captureCanvasEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `canvas_${eventType}`, 'canvas', data);
  }

  /**
   * Capture device events
   */
  async captureDeviceEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `device_${eventType}`, 'device', data);
  }

  /**
   * Capture GitHub events
   */
  async captureGitHubEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `github_${eventType}`, 'github', data);
  }

  /**
   * Capture Slack events
   */
  async captureSlackEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `slack_${eventType}`, 'slack', data);
  }

  /**
   * Capture Discord events
   */
  async captureDiscordEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `discord_${eventType}`, 'discord', data);
  }

  /**
   * Capture Google Drive events
   */
  async captureGoogleDriveEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `google_drive_${eventType}`, 'google_drive', data);
  }

  /**
   * Capture Notion events
   */
  async captureNotionEvent(
    userId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<Event> {
    return this.captureEvent(userId, `notion_${eventType}`, 'notion', data);
  }

  /**
   * Flush event buffer to database
   */
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      const events = this.eventBuffer.splice(0, this.bufferSize);
      
      await this.supabase.from('events').insert(
        events.map(e => ({
          event_id: e.event_id,
          user_id: e.user_id,
          event_type: e.event_type,
          source: e.source,
          timestamp: e.timestamp,
          data: e.data,
          processed: false,
          created_at: e.created_at,
        }))
      );

      console.log(`Flushed ${events.length} events to database`);
    } catch (error) {
      console.error('Error flushing event buffer:', error);
      // Re-add events to buffer if flush fails
      this.eventBuffer.unshift(...this.eventBuffer);
    }
  }

  /**
   * Start periodic buffer flush
   */
  private startEventBuffer(): void {
    setInterval(() => {
      this.flushEventBuffer();
    }, this.flushInterval);
  }

  /**
   * Get events for user within time range
   */
  async getEvents(
    userId: string,
    startTime: Date,
    endTime: Date,
    eventType?: string
  ): Promise<Event[]> {
    try {
      let query = this.supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString());

      if (eventType) {
        query = query.eq('event_type', eventType);
      }

      const { data } = await query.order('timestamp', { ascending: false });
      return data || [];
    } catch (error) {
      console.error('Error getting events:', error);
      return [];
    }
  }

  /**
   * Get events by source
   */
  async getEventsBySource(
    userId: string,
    source: Event['source'],
    limit: number = 100
  ): Promise<Event[]> {
    try {
      const { data } = await this.supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .eq('source', source)
        .order('timestamp', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (error) {
      console.error('Error getting events by source:', error);
      return [];
    }
  }

  /**
   * Mark events as processed
   */
  async markEventsProcessed(eventIds: string[]): Promise<void> {
    try {
      await this.supabase
        .from('events')
        .update({ processed: true })
        .in('event_id', eventIds);
    } catch (error) {
      console.error('Error marking events as processed:', error);
    }
  }

  /**
   * Get unprocessed events
   */
  async getUnprocessedEvents(userId: string, limit: number = 100): Promise<Event[]> {
    try {
      const { data } = await this.supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .eq('processed', false)
        .order('timestamp', { ascending: true })
        .limit(limit);

      return data || [];
    } catch (error) {
      console.error('Error getting unprocessed events:', error);
      return [];
    }
  }

  /**
   * Subscribe to real-time events
   */
  subscribeToEvents(userId: string, callback: (event: Event) => void): void {
    this.on('event', (event: Event) => {
      if (event.user_id === userId) {
        callback(event);
      }
    });
  }

  /**
   * Get event statistics
   */
  async getEventStats(userId: string, days: number = 7): Promise<{
    totalEvents: number;
    eventsBySource: Record<string, number>;
    eventsByType: Record<string, number>;
    eventsPerDay: number;
  }> {
    try {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - days);

      const events = await this.getEvents(userId, startTime, new Date());

      const eventsBySource: Record<string, number> = {};
      const eventsByType: Record<string, number> = {};

      events.forEach(event => {
        eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
        eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
      });

      return {
        totalEvents: events.length,
        eventsBySource,
        eventsByType,
        eventsPerDay: events.length / days,
      };
    } catch (error) {
      console.error('Error getting event stats:', error);
      return {
        totalEvents: 0,
        eventsBySource: {},
        eventsByType: {},
        eventsPerDay: 0,
      };
    }
  }
}

export default EventStreamService;
