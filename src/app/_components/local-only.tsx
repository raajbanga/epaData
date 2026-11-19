import { buttonClass } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import { PageTitle, PageView } from "~/components/ui/page";

const REPO_URL = "https://github.com/raajbanga/epaData";

/** Stands in for a page that writes to the database when the hosted build is read-only. */
export function LocalOnly({ title }: { title: string }) {
  return (
    <PageView header={<PageTitle>{title}</PageTitle>}>
      <EmptyState
        className="border-edge rounded-lg border"
        title="This page only works when you run epaData locally"
        description="**This online version can't save new data.** To add data, download the project from GitHub and follow the README's Setup steps."
        action={
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonClass({ size: "sm" })}
          >
            Download from GitHub
          </a>
        }
      />
    </PageView>
  );
}
