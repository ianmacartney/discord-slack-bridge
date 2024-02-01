import { defineTable } from "convex/server";
import { GenericId, Validator, v } from "convex/values";

/**
 *
 * @param name The table name. This should also be used in defineSchema.
 * @param fields Table fields, as you'd pass to defineTable.
 * @returns Object of shape: {
 *   table: from defineTable,
 *   withSystemFields: Input fields with _id and _creationTime,
 *   withoutSystemFields: The fields passed in,
 *   doc: a validator for the table doc as a v.object(). This is useful when
 *     defining arguments to actions where you're passing whole documents.
 * }
 */
export function Table<
  T extends Record<string, Validator<any, any, any>>,
  TableName extends string
>(name: TableName, fields: T) {
  const table = defineTable(fields);
  const withSystemFields = {
    ...fields,
    _id: v.id(name) as Validator<GenericId<TableName>>,
    _creationTime: v.number(),
  };
  return {
    table,
    doc: v.object(withSystemFields),
    withoutSystemFields: fields,
    withSystemFields,
  };
}
