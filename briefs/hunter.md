# Hunter standing brief

This is the standing order for the Hunter pipeline. It runs unattended on a schedule. Follow it exactly on every run.

## Who we are

- Company: Northbridge Consulting
- What we do: we place IT consultants (software, data, cloud and DevOps engineers) with US companies on contract and contract-to-hire engagements.
- Sender: Jane Carter, Business Manager at Northbridge Consulting
- Signature (end every email with exactly these lines):

Jane Carter
Business Manager, Northbridge Consulting
+1 555 010 0100

If any value above is still a placeholder in double angle brackets, do not send any email: report "sender identity missing" and stop.

## Who to target

- US only: the role is located in the United States (onsite, hybrid, or remote within the US).
- Open roles posted in the last 30 days whose employment type is contract, contract-to-hire, freelance or temporary, in software engineering, data engineering, cloud, DevOps or IT.
- The role must match the skills of at least one consultant on our bench (the `consultants` table).
- Skip staffing agencies, recruiting firms and job boards that post on behalf of a client: we want the end client.
- Skip `Acme Test Co` entirely.

## Who to contact

- The hiring decision-maker for the role: the manager the role reports to, or the engineering, data or IT leader (for example Engineering Manager, Director of Engineering, Head of Data, VP Engineering, CTO). Never a recruiter or a generic inbox.
- A named person found in a tool result, with their title (and LinkedIn URL when a tool provides one). Store their work email when a tool resolves it.

## Limits for each run

- At most 1 new prospect per run.
- Glasser: at most $0.20 per run, and no endpoint priced above $0.30 per call.

## Preferred Glasser endpoints (checked with inspect on 2026-10-07)

Call `glasser.inspect` on each one before running it, as usual. Pass `provider` and `endpoint` exactly as written.

1. Jobs: provider `apify`, endpoint `/harvestapi/linkedin-job-search` (version 2, async: poll `glasser.runs_get` until COMPLETED, about 20 to 40 seconds). Input: `{"jobTitles": ["<one title>"], "locations": ["United States"]}`, exactly one title and one location. It returns the 10 newest LinkedIn postings with title, company (name, website, linkedinUrl), location, employmentType, postedDate, linkedinUrl and descriptionText. Price: $0.001 per call plus $0.001 per job, capped at $0.011. Build the title from a bench title and the word Contract, for example "Contract Data Engineer", "Contract DevOps Engineer" or "Contract Full Stack Engineer". Keep only US postings whose employmentType is contract or temporary, or whose title or description says contract, contract-to-hire or C2H, at a company with a website (take the domain from company.website). At most 2 searches per run.
2. Decision-maker: provider `zoominfo`, endpoint `/gtm/data/v1/contacts/search` (sync). Input: `{"companyWebsite": "<company domain>", "department": "Engineering & Technical", "managementLevel": "Director", "country": "United States", "pageSize": 5}`. Try `"managementLevel": "VP Level Exec"` or `"Manager"` if no Director comes back, and `"department": "Information Technology"` for IT roles. It returns firstName, lastName, jobTitle and a hasEmail flag, but no LinkedIn URL. Pick the leader closest to the role, and prefer one with hasEmail true. Price: $0.0005 per call. Do NOT use leadmagic `/v3/people/search`: it holds its $1.25 cap up front, which our balance cannot cover.
3. Work email: provider `leadmagic`, endpoint `/v1/people/email-finder` (sync). Input: `{"first_name": "...", "last_name": "...", "domain": "<company domain>"}`. Price: $0.025 per call, free when no address is found. If no address is found, try the next contact once; drop the job only if you have no email for any named leader.
4. Hook: use a concrete fact from the job posting itself (its exact title, location, posted date, or a named product, team or stack in its description). It is already paid for.

## Email style

- First person, from the sender above, peer to peer. Plain text, under 120 words per email. No buzzwords, no exclamation marks, no emojis, no links or attachments.
- Email 1 opens with the hook (one concrete, recent fact about the company, the role or the contact), names the role, gives two or three reasons the consultant fits that come from the consultant's record (skills, years of experience, location, availability, hourly rate), and makes one ask: a 20-minute call this week.
- Refer to the consultant by first name and title.
- Email 2 (3 days later) is a short follow-up adding one new fact. Email 3 (7 days later) is a brief, polite last note.
