import { ASSET_DELETE_GRACE_DAYS } from "./assets.js";

/** A customer's delete of a finished run's files (#1093): one route, the MCP tool, the SDK and the cabinet share these. */

export const RUN_MEDIA_PATH = "/v1/runs/:id/media";
export const runMediaPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/media`;

export const DELETE_RUN_MEDIA_DESCRIPTION =
  "Delete the files of one of this account's finished runs by run_id: its video, image or clip, its preview and every other " +
  "file the run made. They are no longer available at once: get_run and the cabinet stop giving links to them. They are " +
  `erased from our storage after ${ASSET_DELETE_GRACE_DAYS} days. The run record, its history and its charge stay; nothing is ` +
  "refunded. Refused with run_not_finished while the run is still going, and with run_media_in_use while another unfinished " +
  "run of this account uses the files, such as a revision of this video or a clip made from this image; delete once that run " +
  "ends. For an analyze_reference run it also deletes the analysis itself at once: get_reference_analysis then answers it as " +
  "deleted, and analyzing the same video again starts a new paid analysis. While the analysis must be kept for now, the " +
  "delete is refused with deletion_held and nothing is deleted; ask support. A repeat answers the same. Free.";

export const DELETE_UPLOAD_DESCRIPTION =
  "Delete one of this account's uploads by upload_id. It is unusable at once: no tool takes it, and get_upload and the " +
  `list stop giving it. Its file is erased from our storage after ${ASSET_DELETE_GRACE_DAYS} days, unless another upload of ` +
  "the same picture is still kept. Runs already made with it stay as they are. Refused with upload_in_use while an " +
  "unfinished run of this account uses it; delete once that run ends. A repeat answers the same. Free.";
