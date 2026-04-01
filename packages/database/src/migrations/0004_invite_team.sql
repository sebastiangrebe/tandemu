-- Add optional team assignment to invites
-- When an invite with a team_id is accepted, the user is auto-assigned to that team
ALTER TABLE invites ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
