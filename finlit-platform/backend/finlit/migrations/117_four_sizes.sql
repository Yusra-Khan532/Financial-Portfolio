-- Task #262 (the owner's rule of 20 Nov 2026): company sizes are four, Large > ₹75,000 Cr, Mid ₹25,000-75,000 Cr, Small ₹10,000-25,000 Cr, Micro < ₹10,000 Cr.
-- A saved screen's "Small" meant below ₹10,000 Cr under the old three-size rule, which is now "Micro": move every saved Small to Micro, so the screen
-- returns the same companies as before, and mark the screen with the day (sizesMoved) so the page shows the one-time note
-- "Company sizes changed on 20 Nov 2026: your Small filter now reads Micro." Large and Mid keep their names. Runs once (schema_migrations).
UPDATE user_state u
SET screens = (
    SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(s -> 'state' -> 'caps') = 'array' AND (s -> 'state' -> 'caps') @> '["Small"]'::jsonb
             THEN jsonb_set(s, '{state,caps}',
                            (SELECT COALESCE(jsonb_agg(CASE WHEN c = '"Small"'::jsonb THEN '"Micro"'::jsonb ELSE c END ORDER BY k), '[]'::jsonb)
                             FROM jsonb_array_elements(s -> 'state' -> 'caps') WITH ORDINALITY AS cc(c, k)))   -- in the saved order (a saved list had no Micro yet)
                  || jsonb_build_object('sizesMoved', '2026-11-20')
             ELSE s END
        ORDER BY ord)
    FROM jsonb_array_elements(u.screens) WITH ORDINALITY AS t(s, ord)
)
WHERE jsonb_typeof(u.screens) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(u.screens) s WHERE jsonb_typeof(s -> 'state' -> 'caps') = 'array' AND (s -> 'state' -> 'caps') @> '["Small"]'::jsonb);
