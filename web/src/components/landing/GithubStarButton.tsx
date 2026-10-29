import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { FaGithub } from "react-icons/fa";

const REPO = "rinkitadhana/openside";

const formatStars = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(count);
};

// Fetched once per page load and shared, since every marketing page mounts its
// own header and would otherwise refetch and replay the count-up on navigation.
let starsRequest: Promise<number | null> | null = null;
let cachedStars: number | null = null;

const fetchStars = () => {
  starsRequest ??= fetch(`https://api.github.com/repos/${REPO}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data && typeof data.stargazers_count === "number") {
        cachedStars = data.stargazers_count;
      }
      return cachedStars;
    })
    .catch(() => null);
  return starsRequest;
};

const GithubStarButton = () => {
  const [stars, setStars] = useState<number | null>(cachedStars);
  // Counts up (1, 2, 3, …) while the fetch is in flight so the button never
  // shows a dead placeholder - it snaps to the real value once it arrives.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Non-critical - the count just keeps ticking if the API call fails.
    fetchStars().then((count) => {
      if (!cancelled && count !== null) setStars(count);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stars !== null) return;
    const id = setInterval(() => setTick((value) => value + 1), 70);
    return () => clearInterval(id);
  }, [stars]);

  return (
    <a
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub repository"
      title="GitHub repository"
      className="flex h-9 items-center gap-2 rounded-lg border border-border bg-primary px-3 text-sm font-medium transition-colors hover:bg-muted"
    >
      <FaGithub className="size-4" />
      <span className="flex items-center gap-1 border-l border-border pl-2 tabular-nums">
        <Star className="size-3.5 fill-current" />
        {stars === null ? tick : formatStars(stars)}
      </span>
    </a>
  );
};

export default GithubStarButton;
