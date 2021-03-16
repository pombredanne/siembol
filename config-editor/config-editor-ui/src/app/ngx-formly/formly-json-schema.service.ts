import { TitleCasePipe } from '@angular/common';
import { Injectable } from '@angular/core';
import { AbstractControl, FormControl } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { ɵreverseDeepMerge as reverseDeepMerge } from '@ngx-formly/core';
import { JSONSchema7, JSONSchema7TypeName } from 'json-schema';
import { cloneDeep } from 'lodash';
import { FormlyFieldConfigCache } from '@ngx-formly/core/lib/components/formly.field.config';


export interface FormlyJsonschemaOptions {
  /**
   * allows to intercept the mapping, taking the already mapped
   * formly field and the original JSONSchema source from which it
   * was mapped.
   */
  map?: (mappedField: FormlyFieldConfig, mapSource: JSONSchema7) => FormlyFieldConfig;
}

export function getFieldInitialValue(field: FormlyFieldConfig) {
  let value = field.options['_initialModel'];
  let paths = getKeyPath(field);
  while (field.parent) {
    field = field.parent;
    paths = [...getKeyPath(field), ...paths];
  }

  for (const path of paths) {
    if (!value) {
      return undefined;
    }
    value = value[path];
  }

  return value;
}

export function getKeyPath(field: FormlyFieldConfigCache): string[] {
  if (!field.key) {
    return [];
  }

  /* We store the keyPath in the field for performance reasons. This function will be called frequently. */
  if (!field._keyPath || field._keyPath.key !== field.key) {
    const key =
      field.key.indexOf('[') === -1
        ? field.key
        : field.key.replace(/\[(\w+)\]/g, '.$1');

    field._keyPath = {
      key: field.key,
      path: key.indexOf('.') !== -1 ? key.split('.') : [key]
    };
  }
}

function isEmpty(v: any) {
  return v === '' || v === undefined || v === null;
}

function isConst(schema: JSONSchema7) {
  return schema.hasOwnProperty('const') || (schema.enum && schema.enum.length === 1);
}

function totalMatchedFields(field: FormlyFieldConfig): number {
  if (field.key && !field.fieldGroup) {
    return getFieldInitialValue(field) !== undefined ? 1 : 0;
  }
  return field.fieldGroup.reduce((s, f) => totalMatchedFields(f) + s, 0);
}

function isFieldValid(field: FormlyFieldConfig): boolean {
  if (field.key) {
    return field.formControl.valid;
  }

  return field.fieldGroup.every(f => isFieldValid(f));
}

interface IOptions extends FormlyJsonschemaOptions {
  schema: JSONSchema7;
  autoClear?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FormlyJsonschema {
  public testSpec: FormlyFieldConfig;
  titleCasePipe: TitleCasePipe = new TitleCasePipe();

  constructor() {}
  toFieldConfig(schema: JSONSchema7, options?: FormlyJsonschemaOptions): FormlyFieldConfig {
    const fieldConfig = this._toFieldConfig(schema, { schema, ...(options || {})}, []);

    return fieldConfig;
  }

  private _toFieldConfig(schema: JSONSchema7, options: IOptions, propKey?: string[]): FormlyFieldConfig {
    schema = this.resolveSchema(schema, options);

    let field: FormlyFieldConfig = {
      type: this.guessType(schema),
      defaultValue: schema.default,
      templateOptions: {
        label: schema.title ? this.titleCasePipe.transform(<string> schema.title.replace(/_/g, ' ')) : '',
        readonly: schema.readOnly,
        description: schema.description,
      },
    };

    field['autoClear'] = true;
    if (options.autoClear === false) {
      field['autoClear'] = false;
    }

    switch (field.type) {
      case 'null': {
        this.addValidator(field, 'null', ({ value }) => value === null);
        break;
      }
      case 'boolean': {
          field.templateOptions.label = this.titleCasePipe.transform(propKey[propKey.length - 1].replace(/_/g, ' '));
          field.templateOptions.description = schema.description;
          break;
      }
      case 'number':
      case 'integer': {
        field.templateOptions.label = this.titleCasePipe.transform(propKey[propKey.length - 1].replace(/_/g, ' '));
        field.parsers = [v => isEmpty(v) ? null : Number(v)];
        if (schema.hasOwnProperty('minimum')) {
          field.templateOptions.min = schema.minimum;
        }

        if (schema.hasOwnProperty('maximum')) {
          field.templateOptions.max = schema.maximum;
        }

        if (schema.hasOwnProperty('exclusiveMinimum')) {
          field.templateOptions.exclusiveMinimum = schema.exclusiveMinimum;
          this.addValidator(field, 'exclusiveMinimum', ({ value }) => isEmpty(value) || (value > schema.exclusiveMinimum));
        }

        if (schema.hasOwnProperty('exclusiveMaximum')) {
          field.templateOptions.exclusiveMaximum = schema.exclusiveMaximum;
          this.addValidator(field, 'exclusiveMaximum', ({ value }) => isEmpty(value) || (value < schema.exclusiveMaximum));
        }

        if (schema.hasOwnProperty('multipleOf')) {
          field.templateOptions.step = schema.multipleOf;
          this.addValidator(field, 'multipleOf', ({ value }) => isEmpty(value) || (value % schema.multipleOf === 0));
        }
        break;
      }
      case 'string': {
        const schemaType = schema.type as JSONSchema7TypeName;
        if (Array.isArray(schemaType) && (schemaType.indexOf('null') !== -1)) {
          field.parsers = [v => isEmpty(v) ? null : v];
        }

        ['minLength', 'maxLength', 'pattern'].forEach(prop => {
          if (schema.hasOwnProperty(prop)) {
            field.templateOptions[prop] = schema[prop];
          }
        });
        field.templateOptions.label = propKey[propKey.length - 1] !== '-'
            ? this.titleCasePipe.transform(propKey[propKey.length - 1].replace(/_/g, ' '))
            : '';
        break;
      }
      case 'object': {
        field.fieldGroup = [];

        const [propDeps, schemaDeps] = this.resolveDependencies(schema);

        // TODO remove hard coded logic for generating the subschema
        if (schema.properties === undefined && !schema.hasOwnProperty('oneOf')) {
            if (this.testSpec !== undefined) {
                field = this.testSpec;
                break;
            } else {
                field.type = 'rawobject';
                break;
            }
        }
        // ***************

        Object.keys(schema.properties || {}).forEach(key => {
          const newPropKey = cloneDeep(propKey);
          newPropKey.push(key);
          const f = this._toFieldConfig(<JSONSchema7> schema.properties[key], options, newPropKey);
          field.fieldGroup.push(f);
          f.key = key;
          if (Array.isArray(schema.required) && schema.required.indexOf(key) !== -1) {
            f.templateOptions.required = true;
          }
          if (f.templateOptions && !f.templateOptions.required && propDeps[key]) {
            f.expressionProperties = {
              'templateOptions.required': m => m && propDeps[key].some(k => !isEmpty(m[k])),
            };
          }

          if (schemaDeps[key]) {
            const getConstValue = (s: JSONSchema7) => {
              return s.hasOwnProperty('const') ? s.const : s.enum[0];
            };

            const oneOfSchema = schemaDeps[key].oneOf;
            if (
              oneOfSchema
              && oneOfSchema.every(o => o.properties && o.properties[key] && isConst(o.properties[key]))
            ) {
              oneOfSchema.forEach(oneOfSchemaItem => {
                const { [key]: constSchema, ...properties } = oneOfSchemaItem.properties;
                field.fieldGroup.push({
                  ...this._toFieldConfig({ ...oneOfSchemaItem, properties }, { ...options, autoClear: true }, newPropKey),
                  hideExpression: m => !m || getConstValue(constSchema) !== m[key],
                });
              });
            } else {
              field.fieldGroup.push({
                ...this._toFieldConfig(schemaDeps[key], options, newPropKey),
                hideExpression: m => !m || isEmpty(m[key]), 
              });
            }

          }
        });

        if (schema.oneOf) {
          field.fieldGroup.push(this.resolveMultiSchema(
            'oneOf',
            <JSONSchema7[]> schema.oneOf,
            options,
            cloneDeep(propKey)
          ));
        }

        if (schema.anyOf) {
          field.fieldGroup.push(this.resolveMultiSchema(
            'anyOf',
            <JSONSchema7[]> schema.anyOf,
            options,
            cloneDeep(propKey)
          ));
        }
        break;
      }
      case 'array': {
        field.fieldGroup = [];
        field.templateOptions.label = this.titleCasePipe.transform(propKey[propKey.length - 1].replace(/_/g, ' '));
        const newPropKey2 = cloneDeep(propKey);
        if (schema.hasOwnProperty('minItems')) {
          field.templateOptions.minItems = schema.minItems;
          this.addValidator(field, 'minItems', ({ value }) => isEmpty(value) || (value.length >= schema.minItems));
        }
        if (schema.hasOwnProperty('maxItems')) {
          field.templateOptions.maxItems = schema.maxItems;
          this.addValidator(field, 'maxItems', ({ value }) => isEmpty(value) || (value.length <= schema.maxItems));
        }
        if (schema.hasOwnProperty('uniqueItems')) {
          field.templateOptions.uniqueItems = schema.uniqueItems;
          this.addValidator(field, 'uniqueItems', ({ value }) => {
            if (isEmpty(value) || !schema.uniqueItems) {
              return true;
            }

            const uniqueItems = Array.from(
              new Set(value.map((v: any) => JSON.stringify(v))),
            );

            return uniqueItems.length === value.length;
          });
        }

        // resolve items schema needed for isEnum check
        if (schema.items && !Array.isArray(schema.items)) {
          schema.items = this.resolveSchema(<JSONSchema7> schema.items, options);
        }

        // TODO: remove isEnum check once adding an option to skip extension
        if (!this.isEnum(schema)) {
          const _this = this;
          Object.defineProperty(field, 'fieldArray', {
            get: function() {
              if (!Array.isArray(schema.items)) {
                // When items is a single schema, the additionalItems keyword is meaningless, and it should not be used.
              	if (newPropKey2[newPropKey2.length - 1] !== '-') {
                  newPropKey2.push('-');
              	}

              	return _this._toFieldConfig(<JSONSchema7> schema.items, options, newPropKey2);
              }

              const length = this.fieldGroup ? this.fieldGroup.length : 0;
              const itemSchema = schema.items[length]
                ? schema.items[length]
                : schema.additionalItems;

              return itemSchema
                ? _this._toFieldConfig(<JSONSchema7> itemSchema, options, newPropKey2)
                : {};
            },
            enumerable: true,
            configurable: true,
          });
        }

        break;
      }
    }

    if (schema.hasOwnProperty('const')) {
      field.templateOptions.const = schema.const;
      this.addValidator(field, 'const', ({ value }) => value === schema.const);
      if (!field.type) {
        field.defaultValue = schema.const;
      }
    }
    if (schema.hasOwnProperty('x-schema-form')) {
        if (schema['x-schema-form'].hasOwnProperty('type')) {
            field.type = schema['x-schema-form'].type;
        }
        if (schema['x-schema-form'].hasOwnProperty('wrappers')) {
            field.wrappers = schema['x-schema-form'].wrappers;
        } else if (field.type === 'object') {
            field.wrappers = ['panel']
        }
        if (schema['x-schema-form'].hasOwnProperty('condition')) {
            if (schema['x-schema-form'].condition.hasOwnProperty('hideExpression')) {
                try {
                    const dynFunc: Function =
                        new Function('model', 'localFields', 'field', schema['x-schema-form'].condition.hideExpression);
                    field.hideExpression = (model, formState, f) => dynFunc(formState.mainModel, model, f);
                } catch {
                    console.warn('Something went wrong with applying condition evaluation to form');
                }
            }
            if (schema['x-schema-form'].condition.hasOwnProperty('disableAutoClear')) {
                field['autoClear'] = false;
            }
        }
    }

    if (this.isEnum(schema)) {
      field.templateOptions.multiple = field.type === 'array';
      field.type = 'enum';
      field.templateOptions.options = this.toEnumOptions(schema);
    }

    // map in possible formlyConfig options from the widget property
    if (schema['widget'] && schema['widget'].formlyConfig) {
      field = reverseDeepMerge(schema['widget'].formlyConfig, field);
    }

    // if there is a map function passed in, use it to allow the user to
    // further customize how fields are being mapped
    return options.map ? options.map(field, schema) : field;
  }

  private resolveSchema(schema: JSONSchema7, options: IOptions): JSONSchema7{
    if (schema.$ref) {
      schema = this.resolveDefinition(schema, options);
    }

    if (schema.allOf) {
      schema = this.resolveAllOf(schema, options);
    }

    return schema;
  }

  private resolveAllOf({ allOf, ...baseSchema }: JSONSchema7, options: IOptions) {
    if (!allOf.length) {
      throw Error(`allOf array can not be empty ${allOf}.`);
    }

    return allOf.reduce((base: JSONSchema7, schema: JSONSchema7) => {
      schema = this.resolveSchema(schema, options);
      if (base.required && schema.required) {
        base.required = [...base.required, ...schema.required];
      }

      if (schema.uniqueItems) {
        base.uniqueItems = schema.uniqueItems;
      }

      // resolve to min value
      ['maxLength', 'maximum', 'exclusiveMaximum', 'maxItems', 'maxProperties']
        .forEach(prop => {
          if (!isEmpty(base[prop]) && !isEmpty(schema[prop])) {
            base[prop] = base[prop] < schema[prop] ? base[prop] : schema[prop];
          }
        });

      // resolve to max value
      ['minLength', 'minimum', 'exclusiveMinimum', 'minItems', 'minProperties']
        .forEach(prop => {
          if (!isEmpty(base[prop]) && !isEmpty(schema[prop])) {
            base[prop] = base[prop] > schema[prop] ? base[prop] : schema[prop];
          }
        });

      return reverseDeepMerge(base, schema);
    }, baseSchema);
  }

  private resolveMultiSchema(
    mode: 'oneOf' | 'anyOf',
    schemas: JSONSchema7[],
    options: IOptions,
    propKey: string[]
  ): FormlyFieldConfig {
    return {
      type: 'union',
      fieldGroup: [
        {
          type: 'enum',
          templateOptions: {
            multiple: mode === 'anyOf',
            options: schemas
              .map((s, i) => ({ label: s.title, value: i })),
          },
        },
        {
          fieldGroup: schemas.map((s, i) => ({
            ...this._toFieldConfig(s, { ...options, autoClear: true }, propKey),
            hideExpression: (m, fs, f) => {
              const selectField = f.parent.parent.fieldGroup[0];
              if (!selectField.formControl) {
                const value = f.parent.fieldGroup
                  .map((f, i) => [f, i] as [FormlyFieldConfig, number])
                  .filter(([f]) => isFieldValid(f))
                  .sort(([f1], [f2]) => {
                    const matchedFields1 = totalMatchedFields(f1);
                    const matchedFields2 = totalMatchedFields(f2);
                    if (matchedFields1 === matchedFields2) {
                      return 0;
                    }

                    return matchedFields2 > matchedFields1 ? 1 : -1;
                  })
                  .map(([, i]) => i)
                ;

                const normalizedValue = [value.length === 0 ? 0 : value[0]];
                const formattedValue = mode === 'anyOf' ? normalizedValue : normalizedValue[0];
                selectField.formControl = new FormControl(formattedValue);
              }

              const control = selectField.formControl;

              return Array.isArray(control.value)
                ? control.value.indexOf(i) === -1
                : control.value !== i;
            },
          })),
        },
      ],
    };
  }

  private resolveDefinition(schema: JSONSchema7, options: IOptions): JSONSchema7 {
    const [uri, pointer] = schema.$ref.split('#/');
    if (uri) {
      throw Error(`Remote schemas for ${schema.$ref} not supported yet.`);
    }

    const definition = !pointer ? null : pointer.split('/').reduce(
      (def, path) => def && def.hasOwnProperty(path) ? def[path] : null,
      options.schema,
    );

    if (!definition) {
      throw Error(`Cannot find a definition for ${schema.$ref}.`);
    }

    if (definition.$ref) {
      return this.resolveDefinition(definition, options);
    }

    return {
      ...definition,
      ...['title', 'description', 'default'].reduce((annotation, p) => {
        if (schema.hasOwnProperty(p)) {
          annotation[p] = schema[p];
        }

        return annotation;
      }, {}),
    };
  }

  private resolveDependencies(schema: JSONSchema7) {
    const deps = {};
    const schemaDeps = {};

    Object.keys(schema.dependencies || {}).forEach(prop => {
      const dependency = schema.dependencies[prop] as JSONSchema7;
      if (Array.isArray(dependency)) {
        // Property dependencies
        dependency.forEach(dep => {
          if (!deps[dep]) {
            deps[dep] = [prop];
          } else {
            deps[dep].push(prop);
          }
        });
      } else {
        // schema dependencies
        schemaDeps[prop] = dependency;
      }
    });

    return [deps, schemaDeps];
  }

  private guessType(schema: JSONSchema7) {
    const type = schema.type as JSONSchema7TypeName;
    if (!type && schema.properties) {
      return 'object';
    }

    if (Array.isArray(type)) {
      if (type.length === 1) {
        return type[0];
      }

      if (type.length === 2 && type.indexOf('null') !== -1) {
        return type[type[0] === 'null' ? 1 : 0];
      }
    }

    return type;
  }

  private addValidator(field: FormlyFieldConfig, name: string, validator: (control: AbstractControl) => boolean) {
    field.validators = field.validators || {};
    field.validators[name] = validator;
  }

  private isEnum(schema: JSONSchema7) {
    return schema.enum
      || (schema.anyOf && schema.anyOf.every(isConst))
      || (schema.oneOf && schema.oneOf.every(isConst))
      || schema.uniqueItems && schema.items && !Array.isArray(schema.items) && this.isEnum(<JSONSchema7> schema.items);
  }

  private toEnumOptions(schema: JSONSchema7) {
    if (schema.enum) {
      return schema.enum.map(value => ({ value, label: value }));
    }

    const toEnum = (s: JSONSchema7) => {
      const value = s.hasOwnProperty('const') ? s.const : s.enum[0];

      return { value: value, label: s.title || value };
    };

    if (schema.anyOf) {
      return schema.anyOf.map(toEnum);
    }

    if (schema.oneOf) {
      return schema.oneOf.map(toEnum);
    }

    return this.toEnumOptions(<JSONSchema7> schema.items);
  }
}