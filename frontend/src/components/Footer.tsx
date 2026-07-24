export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-6 mt-auto">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
        <p>© 2026 TCET Centre of Excellence. All Rights Reserved. Designed for Academic Integrity.</p>
        <div>
          Developed by:{" "}
          <a
            href="https://www.linkedin.com/in/vedantbist/"
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-foreground transition-colors"
          >
            Vedant Bist
          </a>
          {" · "}
          <a
            href="https://www.linkedin.com/in/soham-jain-28a000396/"
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-foreground transition-colors"
          >
            Soham Jain
          </a>
          {" · "}
          <a
            href="https://www.linkedin.com/in/aayush-gupta-255838346/"
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-foreground transition-colors"
          >
            Aayush Gupta
          </a>
          {" · "}
          <a
            href="https://www.linkedin.com/in/gyaneshwar-jha-22b211377/"
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-foreground transition-colors"
          >
            Gyaneshwar Jha
          </a>
          <a
            href="https://www.linkedin.com/in/bhavik-jain-535325321/"
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-foreground transition-colors"
          >
            Bhavik Jain
          </a>
        </div>
      </div>
    </footer>
  );
}
