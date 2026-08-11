CREATE TABLE buildstory_story_events (
  report_id TEXT NOT NULL REFERENCES buildstory_reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  frame_id TEXT NOT NULL DEFAULT '',
  event_day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (report_id, event_type, frame_id, event_day)
);
CREATE INDEX idx_buildstory_story_events_report_day ON buildstory_story_events(report_id, event_day);
