drop policy if exists "No direct client access to MCP image metadata" on public.mcp_image_uploads;
create policy "No direct client access to MCP image metadata"
on public.mcp_image_uploads
for all
to anon, authenticated
using (false)
with check (false);
