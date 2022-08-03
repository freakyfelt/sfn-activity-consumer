import { sayHello } from "../../src";

describe("index", () => {
  it("has a lovely greeting by default", () => {
    expect(sayHello()).toEqual("Hello, World");
  });
});
