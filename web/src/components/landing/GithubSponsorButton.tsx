import { Heart } from "lucide-react";

const SPONSORS_URL = "https://github.com/sponsors/rinkitadhana";

const GithubSponsorButton = () => (
  <a
    href={SPONSORS_URL}
    target="_blank"
    rel="noopener noreferrer"
    title="Sponsor on GitHub"
    className="flex items-center gap-1.5 rounded-full border border-border bg-primary px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
  >
    <Heart className="size-3.5 fill-current text-pink-500" />
    Sponsor
  </a>
);

export default GithubSponsorButton;
