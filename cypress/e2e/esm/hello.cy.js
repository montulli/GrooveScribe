describe('empty spec', () => {
  it('passes', () => {
    cy.visit('http://localhost:3000')
    cy.get("#tuneTitle").type('Rock Beat')
    cy.get("#tuneAuthor").type('Sbstn')
    cy.get("#tuneComments").type('Hello World')
    cy.get('#svgTarget').click()
    cy.get('#svgTarget').should('include.text', 'Rock Beat')
  })
})
