import request from "superagent";
import { 
    TypedJSON 
} from "typedjson";
import {
    readerApi,
    KEY_USER_ID,
} from "../config/api";

import { 
    Article
} from "../models/bookmarks";
import { 
    IPagination
} from "../models/pagination";
import {
    Account,
} from "../models/reader";
import { oauth } from "../util/request";

const serializer = new TypedJSON(Article);

class ArticleRepo {
    async list(account: Account, paging: IPagination): Promise<Array<Article>> {
        const resp = await request
            .get(readerApi.starred)
            .use(oauth)
            .set(KEY_USER_ID, account.id)
            .query(paging);

        return serializer.parseAsArray(resp.text)!;
    }

    async unstar(account: Account, id: string): Promise<boolean> {
        const resp = await request
            .delete(`${readerApi.starred}/${id}`)
            .use(oauth)
            .set(KEY_USER_ID, account.id);

        return resp.noContent;
    }
}

export const articleRepo =  new ArticleRepo();
